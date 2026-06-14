// DFX connect panel — sign in to api.dfx.swiss with one of three methods,
// then show live KYC status and a Start-KYC handoff. Reused by the onboarding
// "Continue with DFX" step and the Fund onramp. The actual document KYC and
// SEPA transfer happen out-of-band in DFX's own flow.

import { useState } from "react";
import { useDfx } from "../lib/dfx/useDfx";
import { hasInjectedWallet, type DfxAuthMethod } from "../lib/dfx";
import { Button } from "./primitives";

const SHORT = (a: string | null) => (a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a || "");

export function DfxConnect({
  mnemonic,
  onVerified,
  compact = false,
}: {
  mnemonic?: string;
  onVerified?: () => void;
  compact?: boolean;
}) {
  const dfx = useDfx();
  const [method, setMethod] = useState<DfxAuthMethod>("derived");
  const [mail, setMail] = useState("");
  const [otp, setOtp] = useState("");

  // ---------- connected ----------
  if (dfx.connected) {
    const kyc = dfx.kyc;
    const verified = kyc?.status === "verified";
    return (
      <div className={`gatebox${verified ? "" : " warn"}`} style={compact ? { marginTop: 12 } : undefined}>
        <div className="clab" style={{ marginBottom: 10 }}>
          DFX ACCOUNT — {dfx.method === "mail" ? "EMAIL" : SHORT(dfx.address).toUpperCase()}
        </div>
        <div className="kv">
          <span className="k">KYC level</span>
          <span className="v">{kyc ? `${kyc.level} · ${kyc.status}` : "loading…"}</span>
        </div>
        {kyc ? (
          <div className="kv">
            <span className="k">Trading limit</span>
            <span className="v">{kyc.tradingLimit.limit.toLocaleString("en-US")} / {kyc.tradingLimit.period.toLowerCase()}</span>
          </div>
        ) : null}
        {dfx.error ? <div className="note" style={{ color: "var(--bad)" }}>{dfx.error}</div> : null}
        <div className="actions" style={{ marginTop: 14 }}>
          {verified ? (
            onVerified ? (
              <Button variant="solid" arrow onClick={onVerified}>Continue</Button>
            ) : (
              <span className="tag-ok" style={{ alignSelf: "center" }}>KYC verified at DFX</span>
            )
          ) : (
            <Button variant="solid" arrow onClick={() => dfx.startKyc()} disabled={dfx.busy}>
              {dfx.busy ? "Opening…" : "Start / continue KYC"}
            </Button>
          )}
          <Button onClick={dfx.disconnect}>Disconnect</Button>
        </div>
        {!verified ? (
          <div className="note">
            KYC runs in DFX's regulated flow (real identity documents, a real person). Complete it
            in the opened tab, then return — your level updates here.
          </div>
        ) : null}
      </div>
    );
  }

  // ---------- email OTP pending ----------
  if (dfx.awaitingOtp) {
    return (
      <div className="gatebox" style={compact ? { marginTop: 12 } : undefined}>
        <div className="clab" style={{ marginBottom: 10 }}>CHECK YOUR EMAIL</div>
        <div className="field" style={{ marginTop: 0 }}>
          <label>CONFIRMATION CODE</label>
          <input className="input" value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="paste the code / otp from the email" />
        </div>
        {dfx.error ? <div className="note" style={{ color: "var(--bad)" }}>{dfx.error}</div> : null}
        <div className="actions" style={{ marginTop: 14 }}>
          <Button variant="solid" arrow onClick={() => dfx.confirmMail(otp.trim())} disabled={dfx.busy || !otp.trim()}>
            {dfx.busy ? "Verifying…" : "Confirm"}
          </Button>
        </div>
      </div>
    );
  }

  // ---------- not connected ----------
  return (
    <div className={compact ? "" : "gatebox"} style={compact ? { marginTop: 12 } : undefined}>
      {!compact ? <div className="clab" style={{ marginBottom: 10 }}>CONNECT DFX ACCOUNT</div> : null}
      <div className="seg" style={{ marginBottom: 14 }}>
        <button type="button" className={method === "derived" ? "on" : ""} onClick={() => setMethod("derived")}>DFX key</button>
        <button type="button" className={method === "wallet" ? "on" : ""} onClick={() => setMethod("wallet")}>Browser wallet</button>
        <button type="button" className={method === "mail" ? "on" : ""} onClick={() => setMethod("mail")}>Email</button>
      </div>

      {method === "derived" ? (
        <>
          <div className="note" style={{ marginTop: 0 }}>
            Derives a dedicated EVM key from your seed and signs DFX's challenge in-app — no external
            wallet. The onramped USDC lands on this address, ready to shield.
          </div>
          <div className="actions" style={{ marginTop: 14 }}>
            <Button variant="solid" arrow onClick={() => dfx.connect("derived", { mnemonic })} disabled={dfx.busy}>
              {dfx.busy ? "Signing in…" : "Sign in with DFX"}
            </Button>
          </div>
        </>
      ) : method === "wallet" ? (
        <>
          <div className="note" style={{ marginTop: 0 }}>
            {hasInjectedWallet()
              ? "Connect MetaMask / a browser wallet to sign in and receive the onramped USDC."
              : "No browser wallet detected — install MetaMask, or use the DFX key method."}
          </div>
          <div className="actions" style={{ marginTop: 14 }}>
            <Button variant="solid" arrow onClick={() => dfx.connect("wallet")} disabled={dfx.busy || !hasInjectedWallet()}>
              {dfx.busy ? "Connecting…" : "Connect browser wallet"}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="field" style={{ marginTop: 0 }}>
            <label>EMAIL</label>
            <input className="input" type="email" value={mail} onChange={(e) => setMail(e.target.value)} placeholder="you@example.com" />
          </div>
          <div className="actions" style={{ marginTop: 14 }}>
            <Button variant="solid" arrow onClick={() => dfx.connect("mail", { mail: mail.trim() })} disabled={dfx.busy || !mail.trim()}>
              {dfx.busy ? "Sending…" : "Send sign-in code"}
            </Button>
          </div>
        </>
      )}
      {dfx.error ? <div className="note" style={{ color: "var(--bad)" }}>{dfx.error}</div> : null}
    </div>
  );
}
