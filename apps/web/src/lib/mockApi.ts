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
  ["DFX Settlement", "Merchant checkout", "340 EURC", "Base", "clean", "settled"],
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
    org: { name: "Nimbus DAO", kind: "Treasury · self-custody" },
    kyc: { status: "unverified", subjectType: null, verifiedAt: null, level: null },
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
    const steps = [
      [20, "submitting identity document …"],
      [48, "screening against OFAC + EU sanctions lists"],
      [72, "verifying jurisdiction · CH/EU/US permitted"],
      [100, "<span class='ok'>✓ verified</span> — added to ASP good-set"],
    ] as const;
    for (const [p, t] of steps) {
      await wait(620);
      onProgress?.({ progress: p, html: t });
    }
    this.session.kyc = {
      status: "verified",
      subjectType: payload.subjectType,
      verifiedAt: new Date().toISOString(),
      level: "L3",
    };
    return structuredClone(this.session.kyc);
  }

  async loginWithDfx(): Promise<Session> {
    await wait(520);
    this.session.authenticated = true;
    this.session.unlocked = true;
    this.session.dfxLinked = true;
    this.session.kyc = {
      status: "verified",
      subjectType: "entity",
      verifiedAt: new Date().toISOString(),
      level: "L3",
    };
    if (!this.wallet) await this.createWallet();
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
      [18, `screening ${params.rows.length} recipients — OFAC + EU`],
      [40, "building per-recipient witnesses (independent lanes)"],
      [66, "<span class='hl'>aggregating</span> into a single unshield"],
      [88, "groth16 fullProve · 6 lanes → same block"],
      [100, "<span class='ok'>✓ settled</span> · one opaque on-chain movement"],
    ];
    for (const [p, t] of steps) {
      await wait(560);
      onProgress?.({ progress: p, html: t });
    }
    return { id: uid("batch"), status: "settled", receiptAvailable: true };
  }

  async authorizePayrollSession(params: PayrollSessionParams): Promise<PayrollSession> {
    await wait(700);
    this.payroll = { ...this.payroll, authorized: true, amount: params.budgetCap };
    return structuredClone(this.payroll);
  }

  async getPayrollSession(): Promise<PayrollSession> {
    await wait(160);
    return structuredClone(this.payroll);
  }

  // ---------- Directory / Ledger ----------
  async getRecipients(): Promise<Recipient[]> {
    await wait(300);
    return [
      { id: uid("r"), label: "Acme GmbH", type: "B2B vendor", address: "0x4f21…ab90", lastPaid: "Jun 11", sanctions: "ok" },
      { id: uid("r"), label: "Core dev — Lena", type: "Contributor", address: "0x7a3f…9c2d", lastPaid: "Jun 1", sanctions: "ok" },
      { id: uid("r"), label: "DFX Settlement", type: "PSP / broker", address: "0x9C22…10FC", lastPaid: "Jun 12", sanctions: "ok" },
      { id: uid("r"), label: "Oracle payout bot", type: "Programmatic", address: "0x33ee…0f5a", lastPaid: "Jun 13", sanctions: "ok" },
    ];
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
      "gathering selected notes (Q2 2026)",
      "proving ∈ associationRoot — <span class='hl'>no history revealed</span>",
      "attesting KYC origin (DFX onramp)",
      "signing attestation",
      "<span class='ok'>✓ receipt.json + receipt.pdf ready — download</span>",
    ];
    let i = 0;
    for (const t of steps) {
      await wait(480);
      i++;
      onProgress?.({ progress: Math.round((i / steps.length) * 100), html: t });
    }
    return {
      id: uid("rcpt"),
      scope: params.scope,
      period: params.period,
      files: ["receipt.json", "receipt.pdf"],
      createdAt: new Date().toISOString(),
    };
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
      provider: "DFX AG",
      rootAge: "fresh · 4 min",
      inclusion: true,
      badSetExclusion: true,
      items: [
        { label: "Provider", value: "DFX AG", level: "ok" },
        { label: "Association root", value: "fresh · 4 min", level: "ok" },
        { label: "Inclusion proof", value: "all funds ∈ good-set", level: "ok" },
        { label: "Bad-set exclusion", value: "enforced", level: "ok" },
      ],
    };
  }

  async getJurisdictionProfile(): Promise<JurisdictionProfile> {
    await wait(220);
    return {
      label: "EU + US profile",
      items: [
        { label: "EU — MiCA / AMLR", value: "active", level: "ok" },
        { label: "EU — Travel Rule (TFR)", value: "off-chain payload", level: "ok" },
        { label: "US — FinCEN / BSA", value: "active", level: "ok" },
        { label: "US — OFAC screening", value: "at shield", level: "ok" },
        { label: "GDPR — data minimisation", value: "no plaintext on-chain", level: "ok" },
      ],
    };
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
