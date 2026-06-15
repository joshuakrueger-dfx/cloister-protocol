// React hook wrapping the DFX facade: connect (3 methods), KYC status,
// start-KYC, onramp. Holds reactive state for the UI.

import { useCallback, useEffect, useState } from "react";
import {
  restoreDfxSession, isDfxConnected, dfxAddress, dfxMethod, disconnectDfx,
  connectDerived, connectWallet, requestDfxMail, confirmDfxMail,
  getDfxKyc, startDfxKyc, setDfxMail, dfxBuyOnramp, dfxReceivedUsdc,
  type DfxAuthMethod, type DfxKycView, type OnrampResult,
} from "./index";
import type { ChainId } from "../types";

// The unlocked mnemonic is kept tab-scoped by RealApi under this key.
const SESSION_MNEMONIC = "cloister.session.mnemonic";
export function unlockedMnemonic(): string | null {
  return sessionStorage.getItem(SESSION_MNEMONIC);
}

export interface DfxState {
  connected: boolean;
  address: string | null;
  method: DfxAuthMethod | null;
  kyc: DfxKycView | null;
  awaitingOtp: boolean;
  busy: boolean;
  error: string | null;
}

export function useDfx() {
  const [state, setState] = useState<DfxState>({
    connected: false, address: null, method: null, kyc: null,
    awaitingOtp: false, busy: false, error: null,
  });

  const refreshKyc = useCallback(async () => {
    if (!isDfxConnected()) return;
    try {
      const kyc = await getDfxKyc();
      setState((s) => ({ ...s, kyc }));
    } catch (e) {
      setState((s) => ({ ...s, error: e instanceof Error ? e.message : "Could not load DFX KYC." }));
    }
  }, []);

  useEffect(() => {
    if (restoreDfxSession()) {
      setState((s) => ({ ...s, connected: true, address: dfxAddress(), method: dfxMethod() }));
      void refreshKyc();
    }
  }, [refreshKyc]);

  const connect = useCallback(async (method: DfxAuthMethod, opts?: { mnemonic?: string; mail?: string }) => {
    setState((s) => ({ ...s, busy: true, error: null }));
    try {
      if (method === "derived") {
        const mnemonic = opts?.mnemonic ?? unlockedMnemonic();
        if (!mnemonic) throw new Error("Unlock your vault first to derive the DFX key.");
        const address = await connectDerived(mnemonic);
        setState((s) => ({ ...s, connected: true, address, method, busy: false }));
        await refreshKyc();
      } else if (method === "wallet") {
        const address = await connectWallet();
        setState((s) => ({ ...s, connected: true, address, method, busy: false }));
        await refreshKyc();
      } else {
        if (!opts?.mail) throw new Error("Enter your email.");
        await requestDfxMail(opts.mail);
        setState((s) => ({ ...s, awaitingOtp: true, busy: false }));
      }
    } catch (e) {
      setState((s) => ({ ...s, busy: false, error: e instanceof Error ? e.message : "DFX connection failed." }));
    }
  }, [refreshKyc]);

  const confirmMail = useCallback(async () => {
    setState((s) => ({ ...s, busy: true, error: null }));
    try {
      await confirmDfxMail();
      setState((s) => ({ ...s, connected: true, awaitingOtp: false, method: "mail", busy: false }));
      await refreshKyc();
    } catch (e) {
      setState((s) => ({ ...s, busy: false, error: e instanceof Error ? e.message : "Not confirmed yet." }));
    }
  }, [refreshKyc]);

  const startKyc = useCallback(async (): Promise<string | null> => {
    setState((s) => ({ ...s, busy: true, error: null }));
    try {
      const url = await startDfxKyc();
      if (url) window.open(url, "_blank", "noopener,noreferrer");
      setState((s) => ({ ...s, busy: false }));
      return url;
    } catch (e) {
      setState((s) => ({ ...s, busy: false, error: e instanceof Error ? e.message : "Could not start KYC." }));
      return null;
    }
  }, []);

  const addMail = useCallback(async (mail: string) => {
    await setDfxMail(mail);
    await refreshKyc();
  }, [refreshKyc]);

  const onramp = useCallback(async (p: { amount: number; currency: string; asset: string; blockchain: string }): Promise<OnrampResult> => {
    return dfxBuyOnramp(p);
  }, []);

  const receivedUsdc = useCallback((chain: ChainId): Promise<number> => dfxReceivedUsdc(chain), []);

  const disconnect = useCallback(() => {
    disconnectDfx();
    setState({ connected: false, address: null, method: null, kyc: null, awaitingOtp: false, busy: false, error: null });
  }, []);

  return { ...state, connect, confirmMail, startKyc, addMail, onramp, receivedUsdc, refreshKyc, disconnect };
}
