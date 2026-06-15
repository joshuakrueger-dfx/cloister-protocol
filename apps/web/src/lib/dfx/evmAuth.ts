// =====================================================================
// EVM auth bridge for DFX. DFX verifies an EIP-191 (personal_sign) signature
// over its challenge — the BabyJubJub shield key cannot do this. We support
// three sign-in methods (all selectable in the connect flow):
//   - "derived": an in-app EVM key derived from the SAME seed (standard
//     m/44'/60'/0'/0/0). No external wallet; self-custodial; this address is
//     also where the onramped USDC lands.
//   - "wallet":  an injected EVM wallet (MetaMask / browser wallet) via
//     window.ethereum personal_sign.
//   - "mail":    DFX email-OTP login — no address/signature at all.
// =====================================================================

import type { SignFn } from "./services";

export type DfxAuthMethod = "derived" | "wallet" | "mail";

export interface EvmSigner {
  address: string;
  signFn: SignFn;
}

/** Derive the in-app EVM auth key from the BIP39 mnemonic (standard Ethereum
 *  derivation path). Distinct from the BabyJubJub shield keys, so no overlap.
 *  ethers is imported dynamically to keep it out of the main bundle. */
export async function deriveEvmSigner(mnemonic: string): Promise<EvmSigner> {
  const { HDNodeWallet } = await import("ethers");
  const wallet = HDNodeWallet.fromPhrase(mnemonic.trim());
  return {
    address: wallet.address,
    signFn: (message: string) => wallet.signMessage(message),
  };
}

interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}
function injectedProvider(): Eip1193Provider | null {
  const w = window as unknown as { ethereum?: Eip1193Provider };
  return w.ethereum ?? null;
}
export function hasInjectedWallet(): boolean {
  return injectedProvider() !== null;
}

/** Connect an injected EVM wallet (MetaMask / browser wallet) and return a
 *  signer that produces EIP-191 signatures via personal_sign. */
export async function connectInjectedSigner(): Promise<EvmSigner> {
  const provider = injectedProvider();
  if (!provider) throw new Error("No browser wallet found. Install MetaMask or use a derived key.");
  const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
  const address = accounts?.[0];
  if (!address) throw new Error("Wallet did not return an address.");
  return {
    address,
    signFn: async (message: string) =>
      (await provider.request({ method: "personal_sign", params: [message, address] })) as string,
  };
}
