// =====================================================================
// DFX API DTOs — ported from dfx-wallet/src/features/dfx-backend/services/dto.
// Matches the live api.dfx.swiss surface (v1 auth/buy, v2 user/kyc).
// =====================================================================

// ---------- Auth ----------
export type SignMessageDto = { message: string; blockchains: string[] };

export type AuthRequestDto = {
  address: string;
  signature: string;
  wallet?: string;
  key?: string;
  blockchain?: string;
  usedRef?: string;
};

export type AuthResponseDto = { accessToken: string };

// ---------- User ----------
export type KycLevel = 0 | 10 | 20 | 30 | 40 | 50 | -10 | -20;
export type LanguageDto = { id: number; name: string; symbol: string };
export type FiatDto = { id: number; name: string };
export type TradingLimitDto = { limit: number; period: string };
export type UserKycDto = { hash: string; level: KycLevel; dataComplete: boolean };
export type UserAddressDto = { address: string; blockchain: string; blockchains: string[] };

export type UserDto = {
  accountId: number;
  accountType: "Personal" | "Organization" | "SoleProprietorship";
  mail: string | null;
  phone: string | null;
  language: LanguageDto;
  currency: FiatDto;
  tradingLimit: TradingLimitDto;
  kyc: UserKycDto;
  addresses: UserAddressDto[];
  activeAddress: UserAddressDto;
};

// ---------- KYC ----------
export type KycStepStatus =
  | "NotStarted" | "InProgress" | "InReview" | "Failed"
  | "Completed" | "Outdated" | "DataRequested" | "OnHold";

export type KycStepDto = {
  name: string;
  type?: string;
  status: KycStepStatus;
  reason?: string;
  sequenceNumber: number;
  isCurrent: boolean;
};

export type KycLevelDto = {
  kycLevel: KycLevel;
  tradingLimit: TradingLimitDto;
  language: LanguageDto;
  kycSteps: KycStepDto[];
};

export type KycSessionDto = KycLevelDto & {
  currentStep?: KycStepDto & {
    session: { url: string; type: "Browser" | "API" | "Token" | "None" };
  };
};

// ---------- Payment (Buy / onramp) ----------
export type FeeDto = { rate: number; fixed: number; network: number; min: number; dfx: number; total: number };
export type AssetDto = { id: number; name: string; uniqueName: string; blockchain: string };

export type PaymentError =
  | "AmountTooLow" | "AmountTooHigh" | "KycRequired" | "KycDataRequired"
  | "LimitExceeded" | "NationalityNotAllowed" | "NameRequired"
  | "PaymentMethodNotAllowed" | "IbanCurrencyMismatch" | "RecommendationRequired"
  | "EmailRequired" | "CountryNotAllowed" | "AssetUnsupported" | "CurrencyUnsupported";

export type BuyPaymentInfoDto = {
  id: number;
  uid: string;
  routeId: number;
  iban: string;
  bic: string;
  name: string;
  street: string;
  number?: string;
  zip: string;
  city: string;
  country: string;
  sepaInstant: boolean;
  remittanceInfo: string;
  paymentRequest?: string;
  amount: number;
  currency: { id: number; name: string };
  estimatedAmount: number;
  asset: AssetDto;
  exchangeRate: number;
  rate: number;
  minVolume: number;
  maxVolume: number;
  fees: FeeDto;
  isValid: boolean;
  error?: PaymentError;
  errors?: PaymentError[];
};
