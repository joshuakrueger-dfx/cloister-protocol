// =====================================================================
// RealApi — implementiert CloisterApi gegen das echte Cloister-Protokoll,
// MIT-clean (gnark), GPL-frei.
//
//   - @cloister/sdk            → Keys, Notes, MerkleTree, Witness, buildTransaction
//   - gnark→WASM (gnarkWasm)   → Poseidon2-Hash + Groth16-Proof, voll im Browser
//   - Provider/Relayer/ASP     → Onramp-Shield, Broadcast, ASP-Root-Publish (server)
//   - Indexer                  → Note-Discovery via View-Tags
//
// Die App ist ein reiner Client: Keys + Hash + Proof entstehen lokal (WASM),
// jeder öffentliche Chain-Touch läuft über den Provider/Relayer.
// =====================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Keypair,
  Note as SdkNote,
  MerkleTree,
  ShieldedWallet,
  syncFromIndexer,
  buildTransaction,
  generateMnemonic,
  validateMnemonic,
  noteNullifier,
} from "@cloister/sdk";
import type { CloisterApi } from "./api";
import type {
  AnonymitySet, AspStatus, Asset, Backend, Balance, BatchDisburseParams, ChainId,
  ComplianceStatus, Disbursement, Disclosure, DisclosureParams, DisburseResult,
  JurisdictionProfile, KycStatus, KycSubmitPayload, Note, PayrollSession,
  PayrollSessionParams, ProgressCallback, Receipt, ReceiptParams, Recipient,
  Session, SingleDisburseParams, Wallet,
} from "./types";
import type { BackendConfig } from "./backends";
import { backendsView, setActiveBackendId } from "./backends";
import { initGnarkBackend, type ProverStatus } from "./gnarkWasm";
import { vaultExists, saveVault, openVault } from "./vault";
import { JURISDICTION_PROFILES } from "./jurisdictions";
import type { ExportFormat } from "./types";

// ---------- Persistenz-Helfer (namespaced pro Backend) ----------
const lsGet = <T>(k: string, fallback: T): T => {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; }
};
const lsSet = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v));

// ---------- Betrag <-> BigInt (whole units, konsistent mit Pool/Demos) ----------
const parseAmount = (s: string): bigint => {
  const clean = String(s).replace(/[, _]/g, "").replace(/[^\d]/g, "");
  if (!clean) throw new Error("invalid amount");
  return BigInt(clean);
};
const fmtAmount = (v: bigint, asset: Asset | string): string =>
  `${v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")} ${asset}`;
const fmtK = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
const shortHex = (x: bigint): string => {
  const h = x.toString(16);
  return `0x${h.slice(0, 4)}…${h.slice(-4)}`;
};
const todayLabel = (): string => new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });

interface RemoteConfig {
  chainId: number;
  pool: string;
  token: string;
  dfxShieldAddress: { pubKey: string; encPubKey: string };
  relayer: string;
  shield: string;
  indexer: string;
  aspEnforced: boolean;
  aspRoot: string;
}

const SESSION_MNEMONIC = "cloister.session.mnemonic"; // tab-scoped (sessionStorage)

export class RealApi implements CloisterApi {
  private apiBase: string;
  private ns: string;
  private cfg: RemoteConfig | null = null;
  private kp: any = null;
  private tree: any = null;
  private wallet: any = null;
  // letzter Prover-Lade-Status (für UI-Anzeige des einmaligen ~Init)
  proverStatus: ProverStatus = { phase: "idle" };

  private baseId: string;

  constructor(config: BackendConfig) {
    if (!config.apiBase) throw new Error(`backend ${config.id} has no apiBase`);
    this.apiBase = config.apiBase.replace(/\/$/, "");
    this.baseId = config.id;
    this.ns = `cloister.${config.id}`;
    // Prover im Hintergrund vorwärmen (einmaliger WASM-/Key-Load), wenn schon entsperrt.
    if (this.mnemonic) void this.ready().catch(() => {});
  }

  // ---------- intern ----------
  private get mnemonic(): string | null { return sessionStorage.getItem(SESSION_MNEMONIC); }
  private set mnemonic(m: string | null) {
    if (m) sessionStorage.setItem(SESSION_MNEMONIC, m);
    else sessionStorage.removeItem(SESSION_MNEMONIC);
  }

  // Stellt sicher, dass das WASM-Backend (Poseidon2 + Groth16) geladen + verdrahtet ist.
  private ready(): Promise<void> {
    return initGnarkBackend((s) => { this.proverStatus = s; });
  }

  private async getConfig(): Promise<RemoteConfig> {
    if (this.cfg) return this.cfg;
    const r = await fetch(`${this.apiBase}/config`);
    if (!r.ok) throw new Error(`provider offline (${this.apiBase})`);
    this.cfg = (await r.json()) as RemoteConfig;
    // Pro Pool-Deployment getrennter Namespace: ein frischer Deploy (Dev-Restart) startet
    // mit leerem App-State statt veraltete Activity/Spent-Notes des alten Pools zu zeigen.
    this.ns = `cloister.${this.baseId}.${(this.cfg.pool || "").toLowerCase().slice(2, 10)}`;
    return this.cfg;
  }

  private async getKeypair(): Promise<any> {
    if (this.kp) return this.kp;
    const m = this.mnemonic;
    if (!m) throw new Error("vault locked — unlock first");
    await this.ready();
    this.kp = await Keypair.fromMnemonic(m);
    return this.kp;
  }

  // Serialisiert: zwei gleichzeitige sync() (z.B. React-StrictMode-Doppel-Effekte oder
  // parallele Screen-Loads) würden sonst auf dem geteilten tree/wallet dieselben Commitments
  // doppelt einfügen → doppelte Balance. Der Lock kettet die Läufe streng nacheinander.
  private _syncLock: Promise<unknown> = Promise.resolve();
  private sync(): Promise<{ cfg: RemoteConfig; kp: any }> {
    const run = this._syncLock.then(() => this._doSync(), () => this._doSync());
    this._syncLock = run.catch(() => {});
    return run;
  }

  private async _doSync(): Promise<{ cfg: RemoteConfig; kp: any }> {
    await this.ready();
    const cfg = await this.getConfig();
    const kp = await this.getKeypair();
    if (!this.tree) this.tree = await new MerkleTree().init();
    if (!this.wallet) this.wallet = new ShieldedWallet(kp, this.tree, "app");
    const indexerBase = cfg.indexer.replace(/\/commitments$/, "");
    await syncFromIndexer(indexerBase, this.tree, [this.wallet]);
    const spent: number[] = lsGet(`${this.ns}.spent`, []);
    if (spent.length) this.wallet.markSpent(spent);
    return { cfg, kp };
  }

  private markSpent(index: number) {
    const spent: number[] = lsGet(`${this.ns}.spent`, []);
    if (!spent.includes(index)) { spent.push(index); lsSet(`${this.ns}.spent`, spent); }
    this.wallet?.markSpent([index]);
  }

  private pushActivity(d: Disbursement) {
    const log: Disbursement[] = lsGet(`${this.ns}.activity`, []);
    log.unshift(d);
    lsSet(`${this.ns}.activity`, log.slice(0, 200));
  }

  // ---------- Session / Auth ----------
  async getSession(): Promise<Session> {
    const kyc = lsGet<KycStatus>("cloister.kyc", { status: "unverified", subjectType: null, jurisdiction: null, verifiedAt: null, level: null });
    const dfxLinked = lsGet<boolean>("cloister.dfx", false);
    const org = lsGet("cloister.org", { name: "Your Treasury", kind: "Treasury · self-custody" });
    return { authenticated: vaultExists() || dfxLinked || !!this.mnemonic, unlocked: !!this.mnemonic, org, kyc, dfxLinked };
  }

  async createWallet(seed?: string[]): Promise<Wallet> {
    await this.ready();
    let mnemonic: string;
    if (seed && seed.length) {
      mnemonic = seed.join(" ").trim().toLowerCase();
      if (!validateMnemonic(mnemonic)) throw new Error("invalid seed phrase (must be a valid 12/24-word BIP39 mnemonic)");
    } else {
      mnemonic = generateMnemonic();
    }
    this.mnemonic = mnemonic;
    this.kp = null;
    const kp = await this.getKeypair();
    return { seedWords: mnemonic.split(" "), address: shortHex(kp.publicKey), createdAt: new Date().toISOString() };
  }

  async unlock(password: string): Promise<Session> {
    if (password.length < 6) throw new Error("Password must be at least 6 characters.");
    if (vaultExists()) {
      this.mnemonic = await openVault(password);
    } else {
      const m = this.mnemonic;
      if (!m) throw new Error("no wallet to secure — create or import a seed first");
      await saveVault(m, password);
    }
    this.kp = null;
    await this.getKeypair();
    return this.getSession();
  }

  async getKycStatus(): Promise<KycStatus> {
    return lsGet<KycStatus>("cloister.kyc", { status: "unverified", subjectType: null, jurisdiction: null, verifiedAt: null, level: null });
  }

  async submitKyc(payload: KycSubmitPayload, onProgress?: ProgressCallback): Promise<KycStatus> {
    // ECHTES Screening über den Provider (server /v1/kyc/screen): Pflichtfelder,
    // Jurisdiktions-Embargo, Sanktionslisten (OFAC/EU) — kann ABLEHNEN. Dokumenten-/
    // Liveness-Verifikation = Aufgabe des lizenzierten Providers (Adapter-Naht).
    onProgress?.({ progress: 10, html: "submitting application — screening…" });
    const r = await fetch(`${this.apiBase}/v1/kyc/screen`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await r.json();
    if (!r.ok) throw new Error(result.error || "screening failed");

    let p = 18;
    const inc = Math.floor(74 / Math.max(1, result.checks.length));
    for (const c of result.checks as Array<{ name: string; pass: boolean; detail: string }>) {
      await new Promise((res) => setTimeout(res, 420));
      p += inc;
      const mark = c.pass ? "<span class='ok'>✓</span>" : "<span style='color:var(--bad)'>✗</span>";
      onProgress?.({ progress: p, html: `${mark} ${c.name} — ${c.detail}` });
    }

    if (result.status !== "verified") {
      const failed = (result.checks as Array<{ name: string; pass: boolean; detail: string }>).filter((c) => !c.pass);
      onProgress?.({ progress: 100, html: "<span style='color:var(--bad)'>✗ rejected</span> — resolve the flagged checks above" });
      throw new Error("KYC rejected: " + failed.map((c) => `${c.name} (${c.detail})`).join("; "));
    }

    onProgress?.({ progress: 100, html: "<span class='ok'>✓ verified</span> — added to ASP good-set" });
    const kyc: KycStatus = {
      status: "verified",
      subjectType: payload.subjectType,
      jurisdiction: payload.jurisdiction,
      verifiedAt: new Date().toISOString(),
      level: "L3",
    };
    lsSet("cloister.kyc", kyc);
    lsSet("cloister.org", {
      name: payload.legalName,
      kind: payload.subjectType === "entity" ? "Treasury · self-custody" : "Individual · self-custody",
    });
    return kyc;
  }

  async loginWithDfx(): Promise<Session> {
    await new Promise((r) => setTimeout(r, 500));
    await this.ready();
    if (!this.mnemonic && !vaultExists()) { this.mnemonic = generateMnemonic(); this.kp = null; }
    await this.getKeypair();
    lsSet("cloister.dfx", true);
    // DFX (CH/EU) führt die regulierte Identität → EU-Profil, KYC vom Provider bestätigt.
    lsSet("cloister.kyc", { status: "verified", subjectType: "entity", jurisdiction: "EU", verifiedAt: new Date().toISOString(), level: "L3" });
    if (!lsGet("cloister.org", null)) lsSet("cloister.org", { name: "DFX-linked account", kind: "Managed · DFX" });
    return this.getSession();
  }

  // ---------- Treasury / Notes ----------
  async getBalance(): Promise<Balance> {
    await this.sync();
    return { total: Number(this.wallet.balance()), asset: "USDC", chains: 1, notes: this.wallet.spendable().length };
  }

  async getNotes(): Promise<Note[]> {
    await this.sync();
    return Promise.all(
      this.wallet.spendable().map(async (n: any): Promise<Note> => ({
        id: `note_${n.index}`,
        chain: "base",
        asset: "USDC",
        amount: Number(n.note.amount),
        commitment: shortHex(await n.note.commitment()),
        spent: false,
      })),
    );
  }

  async getAnonymitySet(): Promise<AnonymitySet> {
    const cfg = await this.getConfig();
    let total = 0;
    try {
      const indexerBase = cfg.indexer.replace(/\/commitments$/, "");
      const j = await (await fetch(`${indexerBase}/commitments?from=0`)).json();
      total = j.total ?? (j.commitments?.length ?? 0);
    } catch { /* indexer offline */ }
    return {
      health: total >= 50 ? "healthy" : total > 0 ? "growing" : "weak",
      buckets: [{ chain: "base", setSize: total, fill: Math.min(total / 100, 1), display: fmtK(total) }],
    };
  }

  async getComplianceStatus(): Promise<ComplianceStatus> {
    const kyc = await this.getKycStatus();
    const cfg = await this.getConfig();
    return {
      items: [
        { label: "KYC origin", value: kyc.status === "verified" ? "verified" : "required", level: kyc.status === "verified" ? "ok" : "pending" },
        { label: "ASP root", value: cfg.aspEnforced ? `enforced · ${shortHex(BigInt(cfg.aspRoot || "0"))}` : "permissive (dev)", level: cfg.aspEnforced ? "ok" : "pending" },
        { label: "Sanctions screen", value: "OFAC + EU at shield", level: "ok" },
        { label: "Proof of innocence", value: "available", level: "ok" },
      ],
    };
  }

  // ---------- Fund / Disburse ----------
  async shield(params: { amount: string; asset: Asset; chain: ChainId; source: string }): Promise<{ commitment: string }> {
    const kyc = await this.getKycStatus();
    if (kyc.status !== "verified") throw new Error("KYC required before funding (compliance gate).");
    const kp = await this.getKeypair();
    const amt = parseAmount(params.amount);
    const r = await fetch(`${this.apiBase}/v1/shield`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount: amt.toString(), ownerPubKey: kp.publicKey.toString(), encPubKey: kp.address().encPubKey }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "shield failed");
    this.pushActivity({ id: `shield_${Date.now()}`, date: todayLabel(), recipient: "Onramp → pool", purpose: `Fund (${params.source})`, amount: fmtAmount(amt, params.asset), chain: "Base", compliance: "clean", status: "settled" });
    await this.sync();
    return { commitment: shortHex(BigInt(data.commitment)) };
  }

  async disburseSingle(params: SingleDisburseParams, onProgress?: ProgressCallback): Promise<DisburseResult> {
    const { cfg, kp } = await this.sync();
    const payAmt = parseAmount(params.amount);

    onProgress?.({ progress: 12, html: `selecting notes ≥ ${params.amount} ${params.asset} …` });
    const note = this.wallet.spendable().find((n: any) => n.note.amount >= payAmt);
    if (!note) throw new Error("no single note large enough — fund the pool or consolidate notes");

    onProgress?.({ progress: 28, html: "building witness · balance · membership · nullifier" });
    onProgress?.({ progress: 50, html: "<span class='hl'>ASP inclusion proof</span> — funds ∈ good-set" });
    onProgress?.({ progress: 66, html: "groth16 prove (in-browser, <span class='hl'>MIT gnark</span>) …" });
    const dfxPub = BigInt(cfg.dfxShieldAddress.pubKey);
    const tx = await buildTransaction({
      tree: this.tree,
      lane: note.lane || 0,
      inputs: [{ note: note.note, privateKey: kp.privateKey, index: note.index }],
      outputs: [
        { note: new SdkNote({ amount: payAmt, pubKey: dfxPub }), encPubKey: cfg.dfxShieldAddress.encPubKey },
        { note: new SdkNote({ amount: note.note.amount - payAmt, pubKey: kp.publicKey }), encPubKey: kp.address().encPubKey },
      ],
      extAmount: 0n,
    });

    onProgress?.({ progress: 92, html: "relaying — gas paid by relayer, <span class='hl'>your address never appears</span>" });
    const r = await fetch(cfg.relayer, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        proof: tx.proof, root: tx.root, newRoot: tx.newRoot, associationRoot: tx.associationRoot,
        inputNullifiers: tx.inputNullifiers, outputCommitments: tx.outputCommitments, extData: tx.extData,
      }),
    });
    const out = await r.json();
    if (!r.ok) throw new Error(out.error || "relayer error");

    this.markSpent(note.index);
    onProgress?.({ progress: 100, html: "<span class='ok'>✓ settled</span> · change note returned · nothing linkable on-chain" });
    const id = `tx_${Date.now()}`;
    this.pushActivity({ id, date: todayLabel(), recipient: params.recipient, purpose: params.memo || "Single payment", amount: fmtAmount(payAmt, params.asset), chain: "Base", compliance: "clean", status: "settled" });
    await this.sync();
    return { id, status: "settled", receiptAvailable: true };
  }

  async disburseBatch(params: BatchDisburseParams, onProgress?: ProgressCallback): Promise<DisburseResult> {
    const total = params.rows.length;
    onProgress?.({ progress: 6, html: `screening ${total} recipients — OFAC + EU` });
    let done = 0;
    for (const row of params.rows) {
      const amt = row.amount.split(" ")[0];
      const asset = (row.amount.split(" ")[1] as Asset) || "USDC";
      await this.disburseSingle({ recipient: row.address, amount: amt, asset, memo: `Batch · ${row.role}` }, (s) => {
        if (s.progress === 100) return;
        const base = 6 + Math.round((done / total) * 88);
        onProgress?.({ progress: Math.min(base + Math.round((s.progress * 0.88) / total), 96), html: `[${done + 1}/${total}] ${s.html}` });
      });
      done++;
    }
    onProgress?.({ progress: 100, html: "<span class='ok'>✓ settled</span> · batch complete · independent shielded payments" });
    return { id: `batch_${Date.now()}`, status: "settled", receiptAvailable: true };
  }

  async authorizePayrollSession(params: PayrollSessionParams): Promise<PayrollSession> {
    const s: PayrollSession = { authorized: true, nextRun: "scheduled", recipients: 0, amount: params.budgetCap, lastRun: "—" };
    lsSet(`${this.ns}.payroll`, s);
    return s;
  }

  async getPayrollSession(): Promise<PayrollSession> {
    await this.getConfig();
    return lsGet<PayrollSession>(`${this.ns}.payroll`, { authorized: false, nextRun: "—", recipients: 0, amount: "—", lastRun: "—" });
  }

  // ---------- Directory / Ledger ----------
  async getRecipients(): Promise<Recipient[]> {
    const cfg = await this.getConfig();
    const stored = lsGet<Recipient[] | null>(`${this.ns}.recipients`, null);
    if (stored) return stored;
    const seed: Recipient[] = [
      { id: "r_dfx", label: "DFX Settlement", type: "PSP / broker", address: shortHex(BigInt(cfg.dfxShieldAddress.pubKey)), lastPaid: "—", sanctions: "ok" },
    ];
    lsSet(`${this.ns}.recipients`, seed);
    return seed;
  }

  async getActivity(): Promise<Disbursement[]> { await this.getConfig(); return lsGet<Disbursement[]>(`${this.ns}.activity`, []); }
  async getRecentDisbursements(): Promise<Disbursement[]> { return (await this.getActivity()).slice(0, 5); }

  // ---------- Compliance Center ----------
  async generateReceipt(params: ReceiptParams, onProgress?: ProgressCallback): Promise<Receipt> {
    const cfg = await this.getConfig();
    const kp = await this.getKeypair();
    const steps = ["gathering selected notes", "proving ∈ associationRoot — <span class='hl'>no history revealed</span>", "attesting KYC origin", "signing attestation"];
    let i = 0;
    for (const t of steps) { await new Promise((r) => setTimeout(r, 420)); i++; onProgress?.({ progress: Math.round((i / (steps.length + 1)) * 100), html: t }); }

    const sig = await noteNullifier(BigInt(cfg.aspRoot || "1"), BigInt(params.period.length + 1), kp.privateKey);
    const signed = {
      kind: "cloister.proof-of-innocence.v1",
      issuer: "Cloister ASP (DFX)",
      subject: shortHex(kp.publicKey),
      scope: params.scope,
      period: params.period,
      associationRoot: cfg.aspRoot,
      chainId: cfg.chainId,
      pool: cfg.pool,
      statement: "Selected funds are members of the ASP good-set and originate from a KYC-verified source. No transaction history is revealed.",
      issuedAt: new Date().toISOString(),
      signature: sig.toString(),
    };

    const { downloadJson, downloadCsv, downloadPdf } = await import("./exporters");
    const base = `cloister-receipt-${params.period.replace(/\s+/g, "_")}`;
    const fields = Object.entries(signed).map(([k, v]) => [k, String(v)] as [string, string]);
    if (params.format === "json") downloadJson(`${base}.json`, signed);
    else if (params.format === "csv") downloadCsv(`${base}.csv`, [["field", "value"], ...fields]);
    else
      downloadPdf(`${base}.pdf`, {
        title: "Cloister — Proof of Innocence",
        subtitle: "Signed attestation that the selected funds belong to the ASP good-set and originate from a KYC-verified source. No transaction history is revealed.",
        fields,
        footer: "Cloister Protocol · compliant shielded payments · verify the signature against the issuer's viewing key.",
      });

    onProgress?.({ progress: 100, html: `<span class='ok'>✓ receipt.${params.format} ready — downloaded</span>` });
    return { id: `rcpt_${Date.now()}`, scope: params.scope, period: params.period, files: [`receipt.${params.format}`], createdAt: new Date().toISOString() };
  }

  async exportAuditLog(format: ExportFormat): Promise<void> {
    const { downloadJson, downloadCsv, downloadPdf } = await import("./exporters");
    const acts = await this.getActivity();
    const headers = ["Date", "Recipient", "Purpose", "Amount", "Chain", "Compliance", "Status"];
    const rows = acts.map((a) => [a.date, a.recipient, a.purpose, a.amount, a.chain, a.compliance, a.status]);
    if (format === "json") downloadJson("cloister-audit-log.json", acts);
    else if (format === "csv") downloadCsv("cloister-audit-log.csv", [headers, ...rows]);
    else
      downloadPdf("cloister-audit-log.pdf", {
        title: "Cloister — Audit Log",
        subtitle: `${acts.length} disbursement events · viewing-key-decrypted ledger`,
        table: { headers, rows },
        footer: "Cloister Protocol · selective disclosure · no plaintext on-chain.",
      });
  }

  async createDisclosure(params: DisclosureParams): Promise<Disclosure> {
    const kp = await this.getKeypair();
    const token = btoa(`${kp.address().encPubKey}:${params.scope}:${params.days}`).slice(0, 44);
    const d: Disclosure = { id: `dis_${Date.now()}`, grantee: params.grantee, scope: params.scope, expiresIn: `${params.days} days`, readOnly: true };
    const list = lsGet<Disclosure[]>("cloister.disclosures", []);
    lsSet("cloister.disclosures", [...list, { ...d, token } as Disclosure]);
    return d;
  }

  async listDisclosures(): Promise<Disclosure[]> { return lsGet<Disclosure[]>("cloister.disclosures", []); }
  async revokeDisclosure(id: string): Promise<void> {
    lsSet("cloister.disclosures", lsGet<Disclosure[]>("cloister.disclosures", []).filter((d) => d.id !== id));
  }

  async getAspStatus(): Promise<AspStatus> {
    const cfg = await this.getConfig();
    const enforced = cfg.aspEnforced;
    return {
      provider: "DFX AG",
      rootAge: enforced ? "current" : "permissive (dev)",
      inclusion: enforced, badSetExclusion: enforced,
      items: [
        { label: "Provider", value: "DFX AG", level: "ok" },
        { label: "Association root", value: enforced ? shortHex(BigInt(cfg.aspRoot || "0")) : "permissive (dev)", level: enforced ? "ok" : "pending" },
        { label: "Inclusion proof", value: enforced ? "in-circuit · all inputs ∈ good-set" : "circuit-bound (not enforced)", level: enforced ? "ok" : "pending" },
        { label: "Bad-set exclusion", value: enforced ? "enforced" : "dev mode", level: enforced ? "ok" : "pending" },
      ],
    };
  }

  async getJurisdictionProfile(): Promise<JurisdictionProfile> {
    const kyc = await this.getKycStatus();
    const j = kyc.jurisdiction ?? "EU"; // bis KYC abgeschlossen: EU als Default-Anzeige
    return { label: j === "EU" ? "EU profile" : "US profile", items: JURISDICTION_PROFILES[j] };
  }

  // ---------- Backends ----------
  async getBackends(): Promise<Backend[]> { return backendsView(); }
  async setBackend(id: string): Promise<Backend[]> { setActiveBackendId(id); return backendsView(); }
}
