// =====================================================================
// MockApi — implementiert CloisterApi mit den Mock-Daten des Prototyps.
//
// Liefert realistische Latenz + die Proof-Step-Progress-Callbacks, damit
// die Disburse-/Receipt-Console exakt wie im Prototyp animiert.
// Hält flüchtigen In-Memory-State (Session, Wallet, Disclosures, Backend),
// damit der Auth-Flow + Compliance-Center sich echt anfühlen.
// =====================================================================

import type { CloisterApi } from "./api";
import { backendsView, setActiveBackendId } from "./backends";
import { JURISDICTION_PROFILES, JURISDICTION_LABEL } from "./jurisdictions";
import type { ExportFormat, KycCheck } from "./types";

// Demo-Screening (lokal): Embargo-Länder + Sanktionsnamen — kann ablehnen (kein Theater).
const EMBARGOED: Record<string, string> = { CU: "Cuba", IR: "Iran", KP: "North Korea (DPRK)", SY: "Syria" };
const SANCTIONED = ["vladimir putin", "kim jong un", "bashar al assad", "wagner group", "tornado cash", "garantex"];
function screenApplicantLocal(p: import("./types").KycSubmitPayload): KycCheck[] {
  const norm = (s: string) => String(s || "").toLowerCase().normalize("NFD").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const fieldsOk = Boolean(p.legalName && p.country && p.idType && p.idNumber && (p.subjectType === "entity" || p.dateOfBirth));
  const cc = (p.country || "").toUpperCase();
  const embargoed = Boolean(EMBARGOED[cc]);
  const n = norm(p.legalName);
  const hit = SANCTIONED.some((s) => s.split(" ").every((w) => n.includes(w)));
  return [
    { name: "Required fields", pass: fieldsOk, detail: fieldsOk ? "complete" : "missing required identity fields" },
    { name: "Jurisdiction screening", pass: !embargoed, detail: embargoed ? `embargoed jurisdiction: ${EMBARGOED[cc]}` : `${cc || "—"} permitted` },
    { name: "Sanctions screening (OFAC SDN / EU)", pass: !hit, detail: hit ? "potential match — referred for review" : "no match on sanctions lists" },
  ];
}
import type {
  AnonymitySet,
  AspStatus,
  Asset,
  Backend,
  Balance,
  BatchDisburseParams,
  ChainId,
  ComplianceStatus,
  Disbursement,
  Disclosure,
  DisclosureParams,
  DisburseResult,
  JurisdictionProfile,
  KycStatus,
  KycSubmitPayload,
  Note,
  PayrollSession,
  PayrollSessionParams,
  ProgressCallback,
  Receipt,
  ReceiptParams,
  Recipient,
  Session,
  SingleDisburseParams,
  Wallet,
} from "./types";

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const uid = (p: string) => `${p}_${Math.random().toString(36).slice(2, 9)}`;

// ---------- BIP39-ähnliche Wortliste (nur Demo, NICHT echt) ----------
const WORDS = [
  "harbor", "velvet", "anchor", "cobalt", "meadow", "ledger", "quartz", "ripple",
  "summit", "thistle", "umbra", "willow", "cipher", "dynamo", "ember", "fathom",
  "granite", "halcyon", "ivory", "juniper", "kelvin", "lumen", "marble", "nimbus",
];

function genSeed(): string[] {
  const out: string[] = [];
  for (let i = 0; i < 12; i++) out.push(WORDS[Math.floor(Math.random() * WORDS.length)]);
  return out;
}

// ---------- Prototyp-Mock-Daten: Transaktionen ----------
const TX: Array<[string, string, string, string, string, Disbursement["status"]]> = [
  ["Acme GmbH", "B2B settlement", "12,500 USDC", "Base", "clean", "settled"],
  ["Core dev — Lena", "Contributor payout", "8,000 USDC", "Base", "clean", "settled"],
  ["Oracle payout bot", "Programmatic", "2,400 USDC", "Polygon", "clean", "proving"],
  ["PSP settlement", "Merchant checkout", "340 EURC", "Base", "clean", "settled"],
  ["Auditor", "DAO payout", "6,000 USDC", "Arbitrum", "clean", "settled"],
];

function txToDisbursement(
  t: (typeof TX)[number],
  i: number,
  withDate: boolean,
): Disbursement {
  return {
    id: uid("tx"),
    date: withDate ? `Jun ${12 - i}` : "",
    recipient: t[0],
    purpose: t[1],
    amount: t[2],
    chain: t[3],
    compliance: "clean",
    status: t[5],
  };
}

export class MockApi implements CloisterApi {
  private session: Session = {
    authenticated: false,
    unlocked: false,
    email: null,
    org: { name: "Your Treasury", kind: "Treasury · self-custody" },
    kyc: { status: "unverified", subjectType: null, jurisdiction: null, verifiedAt: null, level: null },
    dfxLinked: false,
  };
  private wallet: Wallet | null = null;
  private disclosures: Disclosure[] = [
    { id: uid("dis"), grantee: "Tax authority — CH", scope: "Q2 2026", expiresIn: "12 days", readOnly: true },
    { id: uid("dis"), grantee: "External auditor (PwC)", scope: "Payroll only", expiresIn: "4 days", readOnly: true },
  ];
  private payroll: PayrollSession = {
    authorized: false,
    nextRun: "Jul 1",
    recipients: 14,
    amount: "47,800 USDC",
    lastRun: "Jun 1 · ✓ settled",
  };

  // ---------- Session / Auth ----------
  async getSession(): Promise<Session> {
    await wait(120);
    return structuredClone(this.session);
  }

  async createWallet(seed?: string[]): Promise<Wallet> {
    await wait(420);
    this.wallet = {
      seedWords: seed && seed.length === 12 ? seed : genSeed(),
      address: "0x" + Math.random().toString(16).slice(2, 6) + "…" + Math.random().toString(16).slice(2, 6),
      createdAt: new Date().toISOString(),
    };
    return structuredClone(this.wallet);
  }

  async unlock(password: string): Promise<Session> {
    await wait(320);
    if (!password || password.length < 6) throw new Error("Password must be at least 6 characters.");
    this.session.authenticated = true;
    this.session.unlocked = true;
    return structuredClone(this.session);
  }

  async getKycStatus(): Promise<KycStatus> {
    await wait(120);
    return structuredClone(this.session.kyc);
  }

  async submitKyc(payload: KycSubmitPayload, onProgress?: ProgressCallback): Promise<KycStatus> {
    // Demo-Screen — auch hier kein reines Theater: Embargo-Länder + ein paar
    // Sanktionsnamen werden lokal geprüft und können ABLEHNEN.
    const checks = screenApplicantLocal(payload);
    let p = 18;
    const inc = Math.floor(74 / checks.length);
    for (const c of checks) {
      await wait(440);
      p += inc;
      const mark = c.pass ? "<span class='ok'>✓</span>" : "<span style='color:var(--bad)'>✗</span>";
      onProgress?.({ progress: p, html: `${mark} ${c.name} — ${c.detail}` });
    }
    if (!checks.every((c) => c.pass)) {
      onProgress?.({ progress: 100, html: "<span style='color:var(--bad)'>✗ rejected</span> — resolve the flagged checks above" });
      throw new Error("KYC rejected: " + checks.filter((c) => !c.pass).map((c) => `${c.name} (${c.detail})`).join("; "));
    }
    onProgress?.({ progress: 100, html: "<span class='ok'>✓ screened</span> — fields, jurisdiction + sanctions name screen passed (PoC)" });
    this.session.kyc = {
      status: "verified",
      subjectType: payload.subjectType,
      jurisdiction: payload.jurisdiction,
      verifiedAt: new Date().toISOString(),
      level: "L1",
    };
    this.session.org = {
      name: payload.legalName,
      kind: payload.subjectType === "entity" ? "Treasury · self-custody" : "Individual · self-custody",
    };
    return structuredClone(this.session.kyc);
  }

  async confirmEmail(email: string): Promise<Session> {
    await wait(220);
    this.session.email = email;
    this.session.authenticated = true;
    return structuredClone(this.session);
  }

  async markVerifiedExternally(): Promise<Session> {
    await wait(220);
    this.session.kyc = {
      status: "verified",
      subjectType: "individual",
      jurisdiction: "EU",
      verifiedAt: new Date().toISOString(),
      level: "L1",
    };
    this.session.dfxLinked = true;
    return structuredClone(this.session);
  }

  // ---------- Treasury / Notes ----------
  async getBalance(): Promise<Balance> {
    await wait(260);
    return { total: 128400, asset: "USDC", chains: 3, notes: 412 };
  }

  async getNotes(): Promise<Note[]> {
    await wait(260);
    const mk = (chain: ChainId, asset: Asset, amount: number): Note => ({
      id: uid("note"),
      chain,
      asset,
      amount,
      commitment: "0x" + Math.random().toString(16).slice(2, 6) + "…" + Math.random().toString(16).slice(2, 6),
      spent: false,
    });
    return [mk("base", "USDC", 80000), mk("polygon", "USDC", 30000), mk("arbitrum", "USDC", 18400)];
  }

  async getAnonymitySet(): Promise<AnonymitySet> {
    await wait(220);
    return {
      health: "healthy",
      buckets: [
        { chain: "base", setSize: 18400, fill: 0.88, display: "18.4k" },
        { chain: "polygon", setSize: 9100, fill: 0.64, display: "9.1k" },
        { chain: "arbitrum", setSize: 3000, fill: 0.31, display: "3.0k" },
      ],
    };
  }

  async getComplianceStatus(): Promise<ComplianceStatus> {
    await wait(220);
    return {
      items: [
        { label: "KYC origin", value: "verified", level: "ok" },
        { label: "ASP root", value: "fresh · 4 min", level: "ok" },
        { label: "Sanctions screen", value: "OFAC + EU on", level: "ok" },
        { label: "Proof of innocence", value: "available", level: "ok" },
      ],
    };
  }

  // ---------- Fund / Disburse ----------
  async shield(): Promise<{ commitment: string }> {
    await wait(900);
    return { commitment: "0x9f…c41a" };
  }

  async disburseSingle(
    params: SingleDisburseParams,
    onProgress?: ProgressCallback,
  ): Promise<DisburseResult> {
    const steps: Array<[number, string]> = [
      [12, `selecting notes ≥ ${params.amount} ${params.asset} …`],
      [30, "building witness · balance · membership · nullifier"],
      [52, "<span class='hl'>ASP inclusion proof</span> — funds ∈ good-set"],
      [78, "groth16 fullProve … <span class='hl'>~2.3 s</span>"],
      [92, "relaying — gas paid by relayer, <span class='hl'>your address never appears</span>"],
      [100, "<span class='ok'>✓ settled</span> · change note returned · nothing linkable on-chain"],
    ];
    for (const [p, t] of steps) {
      await wait(520);
      onProgress?.({ progress: p, html: t });
    }
    await wait(300);
    return { id: uid("tx"), status: "settled", receiptAvailable: true };
  }

  async disburseBatch(
    params: BatchDisburseParams,
    onProgress?: ProgressCallback,
  ): Promise<DisburseResult> {
    const steps: Array<[number, string]> = [
      [18, `screening ${params.rows.length} recipients — PoC sanctions list`],
      [40, "building per-recipient witnesses (independent lanes)"],
      [66, `proving ${params.rows.length} shielded payments`],
      [88, "groth16 fullProve · one relayer tx per recipient"],
      [100, "<span class='ok'>✓ settled</span> · each payment unlinkable on-chain"],
    ];
    for (const [p, t] of steps) {
      await wait(560);
      onProgress?.({ progress: p, html: t });
    }
    return { id: uid("batch"), status: "settled", receiptAvailable: true };
  }

  async authorizePayrollSession(params: PayrollSessionParams): Promise<PayrollSession> {
    await wait(700);
    this.payroll = { ...this.payroll, authorized: true, amount: params.budgetCap, nextRun: params.schedule };
    return structuredClone(this.payroll);
  }

  async getPayrollSession(): Promise<PayrollSession> {
    await wait(160);
    return structuredClone(this.payroll);
  }

  // ---------- Directory / Ledger ----------
  private recipients: Recipient[] = [
    { id: uid("r"), label: "Acme GmbH", type: "B2B vendor", address: "0x4f21…ab90", lastPaid: "Jun 11", sanctions: "ok" },
    { id: uid("r"), label: "Core dev — Lena", type: "Contributor", address: "0x7a3f…9c2d", lastPaid: "Jun 1", sanctions: "ok" },
    { id: uid("r"), label: "PSP settlement", type: "PSP / broker", address: "0x9C22…10FC", lastPaid: "Jun 12", sanctions: "ok" },
    { id: uid("r"), label: "Oracle payout bot", type: "Programmatic", address: "0x33ee…0f5a", lastPaid: "Jun 13", sanctions: "ok" },
  ];

  async getRecipients(): Promise<Recipient[]> {
    await wait(300);
    return structuredClone(this.recipients);
  }

  async addRecipient(input: import("./types").AddRecipientInput): Promise<Recipient[]> {
    await wait(220);
    this.recipients = [
      { id: uid("r"), label: input.label, type: input.type, address: input.address, lastPaid: "—", sanctions: "ok" },
      ...this.recipients,
    ];
    return structuredClone(this.recipients);
  }

  async getActivity(): Promise<Disbursement[]> {
    await wait(320);
    return TX.map((t, i) => txToDisbursement(t, i, true));
  }

  async getRecentDisbursements(): Promise<Disbursement[]> {
    await wait(280);
    return TX.map((t, i) => txToDisbursement(t, i, false));
  }

  // ---------- Compliance Center ----------
  async generateReceipt(params: ReceiptParams, onProgress?: ProgressCallback): Promise<Receipt> {
    const steps = [
      "gathering selected notes",
      "proving ∈ associationRoot — <span class='hl'>no history revealed</span>",
      "attesting KYC origin",
      "signing attestation",
    ];
    let i = 0;
    for (const t of steps) {
      await wait(420);
      i++;
      onProgress?.({ progress: Math.round((i / (steps.length + 1)) * 100), html: t });
    }
    const signed = {
      kind: "cloister.proof-of-innocence.v1",
      issuer: "Cloister ASP",
      subject: this.session.org.name,
      scope: params.scope,
      period: params.period,
      statement: "Selected funds belong to the ASP good-set and originate from a KYC-verified source. No transaction history is revealed.",
      issuedAt: new Date().toISOString(),
    };
    const { downloadJson, downloadCsv, downloadPdf } = await import("./exporters");
    const base = `cloister-receipt-${params.period.replace(/\s+/g, "_")}`;
    const fields = Object.entries(signed).map(([k, v]) => [k, String(v)] as [string, string]);
    if (params.format === "json") downloadJson(`${base}.json`, signed);
    else if (params.format === "csv") downloadCsv(`${base}.csv`, [["field", "value"], ...fields]);
    else downloadPdf(`${base}.pdf`, { title: "Proof of Innocence", subtitle: signed.statement, fields });
    onProgress?.({ progress: 100, html: `<span class='ok'>✓ receipt.${params.format} ready — downloaded</span>` });
    return { id: uid("rcpt"), scope: params.scope, period: params.period, files: [`receipt.${params.format}`], createdAt: new Date().toISOString() };
  }

  async exportAuditLog(format: ExportFormat): Promise<void> {
    const { downloadJson, downloadCsv, downloadPdf } = await import("./exporters");
    const acts = TX.map((t, i) => txToDisbursement(t, i, true));
    const headers = ["Date", "Recipient", "Purpose", "Amount", "Chain", "Compliance", "Status"];
    const rows = acts.map((a) => [a.date, a.recipient, a.purpose, a.amount, a.chain, a.compliance, a.status]);
    if (format === "json") downloadJson("cloister-audit-log.json", acts);
    else if (format === "csv") downloadCsv("cloister-audit-log.csv", [headers, ...rows]);
    else downloadPdf("cloister-audit-log.pdf", { title: "Audit Log", subtitle: `${acts.length} disbursement events`, table: { headers, rows } });
  }

  async exportStatement(period: string, format: ExportFormat): Promise<void> {
    const { downloadJson, downloadCsv, downloadPdf } = await import("./exporters");
    const bal = await this.getBalance();
    const acts = TX.map((t, i) => txToDisbursement(t, i, true));
    const fields: [string, string][] = [
      ["Account holder", this.session.org.name],
      ["Account type", this.session.org.kind],
      ["Statement period", period],
      ["Jurisdiction", this.session.kyc.jurisdiction ?? "—"],
      ["KYC status", this.session.kyc.status === "verified" ? `verified · ${this.session.kyc.level}` : this.session.kyc.status],
      ["Shielded balance", `${bal.total.toLocaleString("en-US")} ${bal.asset}`],
      ["Notes · chains", `${bal.notes} notes · ${bal.chains} chains`],
    ];
    const headers = ["Date", "Counterparty", "Purpose", "Amount", "Chain", "Status"];
    const rows = acts.map((a) => [a.date, a.recipient, a.purpose, a.amount, a.chain, a.status]);
    const base = `cloister-statement-${period.replace(/\s+/g, "_")}`;
    const subtitle = "Private account statement — balance and settled activity for the period. Counterparties are visible to you, the account holder, only; on-chain the payments stay shielded.";
    const footer = "Issued by Cloister Protocol. Reflects shielded-pool activity for the stated period. For an audit-grade clean-origin attestation, use a Compliance Receipt (proof of innocence).";
    if (format === "json") downloadJson(`${base}.json`, { kind: "cloister.account-statement.v1", holder: this.session.org.name, period, balance: bal, transactions: acts });
    else if (format === "csv") downloadCsv(`${base}.csv`, [["Cloister Account Statement", period], [], headers, ...rows]);
    else downloadPdf(`${base}.pdf`, { title: "Account Statement", subtitle, fields, table: { headers, rows }, footer });
  }

  async createDisclosure(params: DisclosureParams): Promise<Disclosure> {
    await wait(420);
    const d: Disclosure = {
      id: uid("dis"),
      grantee: params.grantee,
      scope: params.scope,
      expiresIn: `${params.days} days`,
      readOnly: true,
    };
    this.disclosures = [...this.disclosures, d];
    return d;
  }

  async listDisclosures(): Promise<Disclosure[]> {
    await wait(200);
    return structuredClone(this.disclosures);
  }

  async revokeDisclosure(id: string): Promise<void> {
    await wait(320);
    this.disclosures = this.disclosures.filter((d) => d.id !== id);
  }

  async getAspStatus(): Promise<AspStatus> {
    await wait(220);
    return {
      provider: "Cloister",
      rootAge: "fresh · 4 min",
      inclusion: true,
      badSetExclusion: true,
      items: [
        { label: "Provider", value: "Cloister", level: "ok" },
        { label: "Association root", value: "fresh · 4 min", level: "ok" },
        { label: "Inclusion proof", value: "all funds ∈ good-set", level: "ok" },
        { label: "Bad-set exclusion", value: "enforced", level: "ok" },
      ],
    };
  }

  async getJurisdictionProfile(): Promise<JurisdictionProfile> {
    await wait(220);
    const j = this.session.kyc.jurisdiction ?? "EU";
    return { label: JURISDICTION_LABEL[j], items: JURISDICTION_PROFILES[j] };
  }

  // ---------- Backends (an das geteilte Modul delegiert) ----------
  async getBackends(): Promise<Backend[]> {
    await wait(80);
    return backendsView();
  }

  async setBackend(id: string): Promise<Backend[]> {
    await wait(120);
    setActiveBackendId(id);
    return backendsView();
  }
}
