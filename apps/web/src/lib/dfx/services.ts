// =====================================================================
// DFX services — auth / user / kyc / buy(onramp) / asset / fiat.
// Ported from dfx-wallet; same live endpoints, trimmed to what the
// Cloister onramp flow needs (sign-in, KYC status/continue, buy paymentInfos).
// =====================================================================

import { dfxApi } from "./client";
import type {
  AuthRequestDto, AuthResponseDto, SignMessageDto, UserDto,
  KycLevelDto, KycSessionDto, BuyPaymentInfoDto,
} from "./dto";

// ---------- Auth ----------
export type SignFn = (message: string) => Promise<string>;

class AuthService {
  async getSignMessage(address: string): Promise<SignMessageDto> {
    return dfxApi.get<SignMessageDto>(`/v1/auth/signMessage?address=${encodeURIComponent(address)}`);
  }

  /** Full sign-in: challenge → sign → POST /v1/auth (auto signs-up first time). */
  async login(address: string, signFn: SignFn, options?: { wallet?: string; blockchain?: string }): Promise<string> {
    const { message } = await this.getSignMessage(address);
    const signature = await signFn(message);
    const req: AuthRequestDto = {
      address,
      signature,
      wallet: options?.wallet ?? "Cloister Console",
      ...(options?.blockchain ? { blockchain: options.blockchain } : {}),
    };
    const res = await dfxApi.post<AuthResponseDto>("/v1/auth", req);
    dfxApi.setAuthToken(res.accessToken);
    return res.accessToken;
  }

  /** Email-OTP sign-in (no wallet signature). */
  async requestMailLogin(mail: string, redirectUri?: string): Promise<void> {
    await dfxApi.post("/v1/auth/mail", {
      mail,
      wallet: "Cloister Console",
      ...(redirectUri ? { redirectUri } : {}),
    });
  }
  async confirmMailLogin(otp: string): Promise<string> {
    const res = await dfxApi.get<{ accessToken: string }>(`/v1/auth/mail/confirm?code=${encodeURIComponent(otp)}`);
    dfxApi.setAuthToken(res.accessToken);
    return res.accessToken;
  }

  adoptToken(token: string) { dfxApi.setAuthToken(token); }
  logout() { dfxApi.clearAuthToken(); }
}

// ---------- User ----------
class UserService {
  getUser(): Promise<UserDto> { return dfxApi.get<UserDto>("/v2/user"); }
  async updateMail(mail: string): Promise<void> { await dfxApi.put("/v2/user/mail", { mail }); }
}

// ---------- KYC ----------
class KycService {
  private async kycHeaders(): Promise<Record<string, string>> {
    const user = await dfxUserService.getUser();
    return { "x-kyc-code": user.kyc.hash };
  }
  async getStatus(): Promise<KycLevelDto> {
    return dfxApi.get<KycLevelDto>("/v2/kyc", { headers: await this.kycHeaders() });
  }
  /** Advance KYC to the next step; the returned session.url opens the
   *  provider (Sumsub) flow in a browser tab. */
  async continueKyc(): Promise<KycSessionDto> {
    return dfxApi.put<KycSessionDto>("/v2/kyc", undefined, { headers: await this.kycHeaders() });
  }
}

// ---------- Asset / Fiat catalogs (cached) ----------
export type DfxAsset = {
  id: number; name: string; uniqueName: string; blockchain: string;
  buyable: boolean; sellable: boolean; evmChainId?: number | null;
};
export type DfxFiat = { id: number; name: string; buyable: boolean; sellable: boolean };

class AssetService {
  private cache: Promise<DfxAsset[]> | null = null;
  list(): Promise<DfxAsset[]> { return (this.cache ??= dfxApi.getPublic<DfxAsset[]>("/v1/asset")); }
  async find(name: string, blockchain: string): Promise<DfxAsset | undefined> {
    const b = blockchain.toLowerCase();
    return (await this.list()).find(
      (a) => a.name.toLowerCase() === name.toLowerCase() && a.blockchain.toLowerCase() === b,
    );
  }
  reset() { this.cache = null; }
}
class FiatService {
  private cache: Promise<DfxFiat[]> | null = null;
  list(): Promise<DfxFiat[]> { return (this.cache ??= dfxApi.getPublic<DfxFiat[]>("/v1/fiat")); }
  async find(name: string): Promise<DfxFiat | undefined> {
    const l = name.toLowerCase();
    return (await this.list()).find((f) => f.name.toLowerCase() === l);
  }
  reset() { this.cache = null; }
}

// ---------- Buy (onramp) ----------
class PaymentService {
  private async assetRef(symbol: string, blockchain: string) {
    const a = await dfxAssetService.find(symbol, blockchain);
    if (!a) throw new Error(`Asset ${symbol} on ${blockchain} not available at DFX`);
    return { id: a.id };
  }
  private async currencyRef(name: string) {
    const f = await dfxFiatService.find(name);
    if (!f) throw new Error(`Currency ${name} not supported`);
    return { id: f.id };
  }

  /** Price preview, no route created. */
  async buyQuote(p: { amount: number; currency: string; asset: string; blockchain: string }): Promise<BuyPaymentInfoDto> {
    const [currency, asset] = await Promise.all([this.currencyRef(p.currency), this.assetRef(p.asset, p.blockchain)]);
    return dfxApi.put<BuyPaymentInfoDto>("/v1/buy/quote", { amount: p.amount, currency, asset, paymentMethod: "Bank", exactPrice: false });
  }

  /** Creates the buy route and returns the SEPA payment instructions
   *  (IBAN/BIC + remittanceInfo reference). Requires auth + KYC. */
  async createBuyPaymentInfo(p: { amount: number; currency: string; asset: string; blockchain: string }): Promise<BuyPaymentInfoDto> {
    const [currency, asset] = await Promise.all([this.currencyRef(p.currency), this.assetRef(p.asset, p.blockchain)]);
    return dfxApi.put<BuyPaymentInfoDto>("/v1/buy/paymentInfos", { amount: p.amount, currency, asset, paymentMethod: "Bank", exactPrice: false });
  }
}

export const dfxAuthService = new AuthService();
export const dfxUserService = new UserService();
export const dfxKycService = new KycService();
export const dfxAssetService = new AssetService();
export const dfxFiatService = new FiatService();
export const dfxPaymentService = new PaymentService();
