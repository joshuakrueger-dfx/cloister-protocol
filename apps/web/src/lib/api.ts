// =====================================================================
// CloisterApi — DIE zentrale Abstraktion.
//
// Sämtliche Screens sprechen ausschließlich gegen dieses Interface, nie
// direkt gegen das SDK. So lässt sich die `MockApi` (unten) später 1:1
// durch eine `RealApi` (siehe realApi.ts) ersetzen, die `@cloister/sdk`
// + Indexer + Relayer anbindet — ohne dass eine UI-Komponente sich ändert.
// =====================================================================

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
  ExportFormat,
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
  AddRecipientInput,
  Session,
  SingleDisburseParams,
  Wallet,
} from "./types";

export interface CloisterApi {
  // ---------- Session / Auth ----------
  getSession(): Promise<Session>;
  createWallet(seed?: string[]): Promise<Wallet>;
  unlock(password: string): Promise<Session>;
  getKycStatus(): Promise<KycStatus>;
  submitKyc(payload: KycSubmitPayload, onProgress?: ProgressCallback): Promise<KycStatus>;
  /** Onboarding: record the email the user verified with a one-time code. */
  confirmEmail(email: string): Promise<Session>;
  /** Settings: update the editable account profile (display name, contact email). */
  updateProfile(p: { name?: string; email?: string }): Promise<Session>;
  /** Mark KYC verified after the account-based (DFX) verification completes in the dashboard. */
  markVerifiedExternally(): Promise<Session>;

  // ---------- Treasury / Notes ----------
  getBalance(chain?: ChainId | "all"): Promise<Balance>;
  getNotes(): Promise<Note[]>;
  getAnonymitySet(): Promise<AnonymitySet>;
  getComplianceStatus(): Promise<ComplianceStatus>;

  // ---------- Fund / Disburse ----------
  shield(params: {
    amount: string;
    asset: Asset;
    chain: ChainId;
    source: string;
  }): Promise<{ commitment: string }>;
  disburseSingle(
    params: SingleDisburseParams,
    onProgress?: ProgressCallback,
  ): Promise<DisburseResult>;
  disburseBatch(
    params: BatchDisburseParams,
    onProgress?: ProgressCallback,
  ): Promise<DisburseResult>;
  authorizePayrollSession(params: PayrollSessionParams): Promise<PayrollSession>;
  getPayrollSession(): Promise<PayrollSession>;

  // ---------- Directory / Ledger ----------
  getRecipients(): Promise<Recipient[]>;
  addRecipient(input: AddRecipientInput): Promise<Recipient[]>;
  toggleRecipientFavorite(id: string): Promise<Recipient[]>;
  getActivity(): Promise<Disbursement[]>;
  getRecentDisbursements(): Promise<Disbursement[]>;

  // ---------- Compliance Center ----------
  generateReceipt(params: ReceiptParams, onProgress?: ProgressCallback): Promise<Receipt>;
  exportAuditLog(format: ExportFormat): Promise<void>;
  /** Branded account statement (Konto-Auszug): balance + settled activity for a period. */
  exportStatement(period: string, format: ExportFormat): Promise<void>;
  createDisclosure(params: DisclosureParams): Promise<Disclosure>;
  listDisclosures(): Promise<Disclosure[]>;
  revokeDisclosure(id: string): Promise<void>;
  getAspStatus(): Promise<AspStatus>;
  getJurisdictionProfile(): Promise<JurisdictionProfile>;

  // ---------- Backends ----------
  getBackends(): Promise<Backend[]>;
  setBackend(id: string): Promise<Backend[]>;
}
