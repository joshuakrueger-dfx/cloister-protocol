// =====================================================================
// High-level DFX facade for the Cloister Console. Ties together auth (3
// methods), KYC status/continue, and the buy(onramp) — and persists the JWT
// (tab-scoped) + the connected EVM address. Everything talks to the live
// api.dfx.swiss; the actual SEPA transfer + document KYC happen out-of-band.
// =====================================================================

import { dfxApi, DfxApiError } from "./client";
import {
  dfxAuthService, dfxUserService, dfxKycService, dfxPaymentService,
} from "./services";
import { deriveEvmSigner, connectInjectedSigner, hasInjectedWallet } from "./evmAuth";
import type { DfxAuthMethod } from "./evmAuth";
import type { BuyPaymentInfoDto, KycLevel, UserDto } from "./dto";

export { DfxApiError, hasInjectedWallet };
export type { DfxAuthMethod, BuyPaymentInfoDto, UserDto };

const JWT_KEY = "cloister.dfx.jwt"; // sessionStorage (tab-scoped)
const ADDR_KEY = "cloister.dfx.address";
const METHOD_KEY = "cloister.dfx.method";

// ---------- session ----------
export function restoreDfxSession(): boolean {
  const jwt = sessionStorage.getItem(JWT_KEY);
  if (jwt) { dfxAuthService.adoptToken(jwt); return true; }
  return false;
}
export function isDfxConnected(): boolean {
  return !!dfxApi.getAuthToken() || !!sessionStorage.getItem(JWT_KEY);
}
export function dfxAddress(): string | null { return localStorage.getItem(ADDR_KEY); }
export function dfxMethod(): DfxAuthMethod | null {
  return (localStorage.getItem(METHOD_KEY) as DfxAuthMethod) || null;
}
export function disconnectDfx(): void {
  dfxAuthService.logout();
  sessionStorage.removeItem(JWT_KEY);
  localStorage.removeItem(ADDR_KEY);
  localStorage.removeItem(METHOD_KEY);
}

function persist(jwt: string, address: string, method: DfxAuthMethod) {
  sessionStorage.setItem(JWT_KEY, jwt);
  localStorage.setItem(ADDR_KEY, address);
  localStorage.setItem(METHOD_KEY, method);
}

// ---------- connect (wallet-signature methods) ----------
/** Sign in with the in-app derived EVM key (needs the unlocked mnemonic). */
export async function connectDerived(mnemonic: string): Promise<string> {
  const signer = await deriveEvmSigner(mnemonic);
  const jwt = await dfxAuthService.login(signer.address, signer.signFn, { blockchain: "Ethereum" });
  persist(jwt, signer.address, "derived");
  return signer.address;
}
/** Sign in with an injected browser wallet (MetaMask / WalletConnect-style). */
export async function connectWallet(): Promise<string> {
  const signer = await connectInjectedSigner();
  const jwt = await dfxAuthService.login(signer.address, signer.signFn, { blockchain: "Ethereum" });
  persist(jwt, signer.address, "wallet");
  return signer.address;
}

// ---------- connect (email) ----------
// DFX email login is a magic-link bound to a wallet account (its /v1/auth/mail
// is authenticated; confirmation happens by clicking the emailed link, not by
// pasting a code). In the console the vault is unlocked, so we authenticate the
// derived key silently first, bind the email, then the user clicks the link and
// we re-auth to verify it attached. UX is email-only; the key work is invisible.
const SESSION_MNEMONIC = "cloister.session.mnemonic";
function sessionMnemonic(): string | null {
  return sessionStorage.getItem(SESSION_MNEMONIC);
}

/** Step 1: authenticate (derived key) if needed, then email DFX a confirmation link. */
export async function requestDfxMail(mail: string, mnemonic?: string): Promise<void> {
  if (!isDfxConnected()) {
    const m = mnemonic ?? sessionMnemonic();
    if (!m) throw new Error("Unlock your vault first — email sign-in binds to your account key.");
    await connectDerived(m);
  }
  await dfxAuthService.requestMailLogin(mail);
}

/** Step 2: after the user clicks the emailed link, re-auth and verify the email
 *  is now attached. Throws if not confirmed yet. */
export async function confirmDfxMail(mnemonic?: string): Promise<void> {
  const m = mnemonic ?? sessionMnemonic();
  if (m) await connectDerived(m); // pull the post-confirmation (possibly merged) session
  const user = await dfxUserService.getUser();
  if (!user.mail) {
    throw new Error("Not confirmed yet — open the email from DFX and click the confirmation link, then try again.");
  }
  localStorage.setItem(METHOD_KEY, "mail");
}

// ---------- KYC ----------
export interface DfxKycView {
  level: KycLevel;
  status: "unverified" | "pending" | "verified";
  tradingLimit: { limit: number; period: string };
  mail: string | null;
}

/** DFX KYC levels: 0 none · 10 contact · 20 personal/link · 30 full · 40/50 enhanced.
 *  We treat ≥ 30 as verified, 10–20 as pending, 0/negative as unverified. */
function levelToStatus(level: KycLevel): DfxKycView["status"] {
  if (level >= 30) return "verified";
  if (level >= 10) return "pending";
  return "unverified";
}

export async function getDfxKyc(): Promise<DfxKycView> {
  const [user, kyc] = await Promise.all([dfxUserService.getUser(), dfxKycService.getStatus()]);
  return {
    level: kyc.kycLevel,
    status: levelToStatus(kyc.kycLevel),
    tradingLimit: kyc.tradingLimit,
    mail: user.mail,
  };
}

// DFX-hosted KYC page. Production: https://app.dfx.swiss/kyc · Sandbox:
// https://dev.app.dfx.swiss/kyc. Override with VITE_DFX_KYC_URL.
const DFX_KYC_PAGE =
  (import.meta.env.VITE_DFX_KYC_URL as string | undefined)?.replace(/\/$/, "") || "https://app.dfx.swiss/kyc";

/** Advance KYC; returns a URL to open in a new tab. Prefers the interactive
 *  step URL from /v2/kyc; falls back to the DFX-hosted KYC page with the current
 *  session token (the path DFX recommends): app.dfx.swiss/kyc?session=<jwt>. */
export async function startDfxKyc(): Promise<string | null> {
  try {
    const session = await dfxKycService.continueKyc();
    const url = session.currentStep?.session?.url;
    if (url) return url;
  } catch {
    /* fall through to the hosted KYC page */
  }
  const jwt = dfxApi.getAuthToken() ?? sessionStorage.getItem("cloister.dfx.jwt");
  return jwt ? `${DFX_KYC_PAGE}?session=${encodeURIComponent(jwt)}` : null;
}

export async function setDfxMail(mail: string): Promise<void> {
  await dfxUserService.updateMail(mail);
}

// ---------- onramp (buy) ----------
export interface OnrampResult {
  info: BuyPaymentInfoDto;
  /** human-readable blocker if DFX gated the buy (KYC/email/limit), else null */
  blocked: string | null;
}

function paymentErrorMessage(e: string): string {
  switch (e) {
    case "KycRequired": case "KycDataRequired": return "KYC verification required before you can buy.";
    case "EmailRequired": return "Add an email to your DFX account before buying.";
    case "RecommendationRequired": return "This account needs a one-time DFX approval before trading.";
    case "LimitExceeded": return "Amount exceeds your current trading limit.";
    case "AmountTooLow": return "Amount is below the minimum.";
    case "AmountTooHigh": return "Amount is above the maximum.";
    case "CountryNotAllowed": case "NationalityNotAllowed": return "Your country is not permitted for this buy.";
    default: return `Buy not available (${e}).`;
  }
}

/** Create a real DFX buy route and return the SEPA payment instructions.
 *  The bought USDC is delivered to the authenticated EVM address (the buy
 *  route address). Surfaces DFX gating errors instead of throwing. */
export async function dfxBuyOnramp(p: {
  amount: number; currency: string; asset: string; blockchain: string;
}): Promise<OnrampResult> {
  try {
    const info = await dfxPaymentService.createBuyPaymentInfo(p);
    const err = info.error ?? info.errors?.[0];
    return { info, blocked: err ? paymentErrorMessage(err) : null };
  } catch (e) {
    if (e instanceof DfxApiError && e.isKycRequired) {
      throw new Error("KYC verification required before you can buy. Start KYC first.");
    }
    throw e;
  }
}

/** Price preview without creating a route (works pre-KYC for the estimate). */
export async function dfxBuyQuote(p: {
  amount: number; currency: string; asset: string; blockchain: string;
}): Promise<BuyPaymentInfoDto> {
  return dfxPaymentService.buyQuote(p);
}

// ---------- onramp → shield handoff ----------
/** On-chain USDC balance of the connected DFX address on `chain`. After a buy
 *  settles, DFX delivers USDC here — poll it to offer "shield it" on arrival. */
export async function dfxReceivedUsdc(chain: import("../types").ChainId): Promise<number> {
  const addr = dfxAddress();
  if (!addr) return 0;
  const { usdcBalance } = await import("./onchain");
  return usdcBalance(addr, chain);
}
