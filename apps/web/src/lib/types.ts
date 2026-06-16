// =====================================================================
// Geteilte Domain-Typen für das Cloister-Console-Front-end.
// Bewusst entkoppelt von @cloister/sdk, damit die RealApi später die
// SDK-Modelle hierauf mappen kann (siehe realApi.ts).
// =====================================================================

export type ChainId = "base" | "polygon" | "arbitrum";

export interface ChainInfo {
  id: ChainId;
  label: string;
}

export const CHAINS: ChainInfo[] = [
  { id: "base", label: "Base" },
  { id: "polygon", label: "Polygon" },
  { id: "arbitrum", label: "Arbitrum" },
];

export type Asset = "USDC" | "EURC" | "USDT";

// ---------- Session / Auth ----------
export type KycStatusValue = "unverified" | "pending" | "verified";
export type KycSubjectType = "individual" | "entity";
// Regulatorisches Heimatprofil des Nutzers — bestimmt, welche Compliance-Regeln
// (EU: MiCA/AMLR/TFR/GDPR · US: FinCEN/BSA/OFAC) angezeigt + angewendet werden.
export type Jurisdiction = "EU" | "US";

export interface KycStatus {
  status: KycStatusValue;
  subjectType: KycSubjectType | null;
  jurisdiction: Jurisdiction | null;
  verifiedAt: string | null;
  level: "L1" | "L2" | "L3" | null;
}

// Einzelnes Screening-Ergebnis (Pflichtfelder, Alter, Jurisdiktion, Sanktionen).
export interface KycCheck {
  name: string;
  pass: boolean;
  detail: string;
}

export interface KycScreenResult {
  status: "verified" | "rejected" | "review";
  checks: KycCheck[];
}

export interface Session {
  authenticated: boolean;
  unlocked: boolean;
  email: string | null;
  org: { name: string; kind: string };
  kyc: KycStatus;
  dfxLinked: boolean;
}

export interface Wallet {
  // Mnemonic wird nur clientseitig im Mock gehalten; nie persistiert.
  seedWords: string[];
  address: string; // öffentliche Anker-Adresse (Anzeige)
  createdAt: string;
}

export interface KycSubmitPayload {
  subjectType: KycSubjectType;
  jurisdiction: Jurisdiction;
  legalName: string;
  country: string; // ISO-3166 alpha-2
  idType: string;
  idNumber: string;
  dateOfBirth: string; // ISO date (individuals)
}

// ---------- Balance / Notes ----------
export interface Balance {
  total: number;
  asset: Asset;
  chains: number;
  notes: number;
}

export interface Note {
  id: string;
  chain: ChainId;
  asset: Asset;
  amount: number;
  commitment: string;
  spent: boolean;
}

export interface AnonymityBucket {
  chain: ChainId;
  setSize: number; // absolute Größe des Anonymity-Sets
  fill: number; // 0..1 für die Meter-Bar
  display: string; // z.B. "18.4k"
}

export interface AnonymitySet {
  health: "healthy" | "weak" | "growing";
  buckets: AnonymityBucket[];
}

// ---------- Compliance ----------
export type StatusLevel = "ok" | "pending" | "bad";

export interface ComplianceItem {
  label: string;
  value: string;
  level: StatusLevel;
}

export interface ComplianceStatus {
  items: ComplianceItem[];
}

export interface AspStatus {
  provider: string;
  rootAge: string;
  inclusion: boolean;
  badSetExclusion: boolean;
  items: ComplianceItem[];
}

export interface JurisdictionProfile {
  label: string; // z.B. "EU + US profile"
  items: ComplianceItem[];
}

// ---------- Disbursements / Activity ----------
export type DisbursementStatus = "settled" | "pending" | "proving" | "failed";

export interface Disbursement {
  id: string;
  date: string;
  recipient: string;
  purpose: string;
  amount: string; // formatiert inkl. Asset, z.B. "12,500 USDC"
  chain: string;
  compliance: "clean" | "flagged";
  status: DisbursementStatus;
}

export interface Recipient {
  id: string;
  label: string; // viewing-key-verschlüsseltes Label
  type: string;
  address: string;
  lastPaid: string;
  sanctions: StatusLevel;
  favorite?: boolean;
}

export interface AddRecipientInput {
  label: string;
  type: string;
  address: string;
}

export interface BatchRow {
  address: string;
  role: string;
  amount: string;
  chain: string;
  sanctions: StatusLevel;
}

// ---------- Disbursement-Params ----------
export interface SingleDisburseParams {
  recipient: string;
  amount: string;
  asset: Asset;
  memo: string;
}

export interface BatchDisburseParams {
  rows: BatchRow[];
}

export interface PayrollSessionParams {
  schedule: string;
  budgetCap: string;
}

export interface PayrollSession {
  authorized: boolean;
  nextRun: string;
  recipients: number;
  amount: string;
  lastRun: string;
}

// ---------- Proof-Progress (für animierte Console) ----------
export interface ProofStep {
  progress: number; // 0..100
  // HTML erlaubt (Inline-Highlights wie im Prototyp); nur aus Mock-Daten gespeist.
  html: string;
}

export type ProgressCallback = (step: ProofStep) => void;

export interface DisburseResult {
  id: string;
  status: DisbursementStatus;
  receiptAvailable: boolean;
}

// ---------- Compliance Receipt / Disclosure ----------
export type ReceiptScope = "single" | "range" | "counterparty";
export type ExportFormat = "pdf" | "csv" | "json";

export interface ReceiptParams {
  scope: ReceiptScope;
  period: string;
  format: ExportFormat;
}

export interface Receipt {
  id: string;
  scope: ReceiptScope;
  period: string;
  files: string[]; // z.B. ["receipt.json", "receipt.pdf"]
  createdAt: string;
}

export interface Disclosure {
  id: string;
  grantee: string;
  scope: string;
  expiresIn: string;
  readOnly: boolean;
}

export interface DisclosureParams {
  grantee: string;
  scope: string;
  days: number;
}

// ---------- Backends ----------
export interface Backend {
  id: string;
  label: string;
  meta: string;
  active: boolean;
}
