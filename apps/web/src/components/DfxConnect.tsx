// DFX connect panel — sign in to api.dfx.swiss with one of three methods,
// then show live KYC status and a Start-KYC handoff. Reused by the onboarding
// "Continue with DFX" step and the Fund onramp. The actual document KYC and
// SEPA transfer happen out-of-band in DFX's own flow.

import { useState } from "react";
import { useDfx } from "../lib/dfx/useDfx";
import { hasInjectedWallet, type DfxAuthMethod } from "../lib/dfx";
import { Button, Dots } from "./primitives";

const SHORT = (a: string | null) => (a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a || "");

export function DfxConnect({
  mnemonic,
  onVerified,
  compact = false,
  methods,
}: {
  mnemonic?: string;
  onVerified?: () => void;
  compact?: boolean;
  /** Restrict the available sign-in methods (e.g. ["mail"] for email-only). */
  methods?: DfxAuthMethod[];
}) {
  const dfx = useDfx();
  const allowed = methods && methods.length ? methods : (["derived", "wallet", "mail"] as DfxAuthMethod[]);
  const [method, setMethod] = useState<DfxAuthMethod>(allowed[0]);
  const [mail, setMail] = useState("");

  // ---------- connected ----------
  if (dfx.connected) {
    const kyc = dfx.kyc;
    const verified = kyc?.status === "verified";
    return (
      <div className={`gatebox${verified ? "" : " warn"}`} style={compact ? { marginTop: 12 } : undefined}>
        <div className="clab" style={{ marginBottom: 10 }}>
          ACCOUNT — {dfx.method === "mail" ? "EMAIL" : SHORT(dfx.address).toUpperCase()}
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
              <span className="tag-ok" style={{ alignSelf: "center" }}>KYC verified</span>
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
            KYC runs in a regulated flow (real identity documents, a real person). Complete it
            in the opened tab, then return — your level updates here.
          </div>
        ) : null}
      </div>
    );
  }

  // ---------- email confirmation pending (magic link) ----------
  if (dfx.awaitingOtp) {
    return (
      <div className="gatebox" style={compact ? { marginTop: 12 } : undefined}>
        <div className="clab" style={{ marginBottom: 10 }}>CHECK YOUR EMAIL</div>
        <div className="note" style={{ marginTop: 0 }}>
          A confirmation link was emailed to you. Open it and click <b>confirm</b> — then come back here
          and continue. (The link can't return to localhost, so you confirm manually.)
        </div>
        {dfx.error ? <div className="note" style={{ color: "var(--bad)" }}>{dfx.error}</div> : null}
        <div className="actions" style={{ marginTop: 14 }}>
          <Button variant="solid" arrow onClick={() => dfx.confirmMail()} disabled={dfx.busy}>
            {dfx.busy ? <>Checking<Dots /></> : "I've confirmed — continue"}
          </Button>
        </div>
      </div>
    );
  }

  // ---------- not connected ----------
  return (
    <div className={compact ? "" : "gatebox"} style={compact ? { marginTop: 12 } : undefined}>
      {!compact ? <div className="clab" style={{ marginBottom: 10 }}>CONNECT ACCOUNT</div> : null}
      {allowed.length > 1 ? (
        <div className="seg" style={{ marginBottom: 14 }}>
          {allowed.includes("derived") ? (
            <button type="button" className={method === "derived" ? "on" : ""} onClick={() => setMethod("derived")}>In-app key</button>
          ) : null}
          {allowed.includes("wallet") ? (
            <button type="button" className={method === "wallet" ? "on" : ""} onClick={() => setMethod("wallet")}>Browser wallet</button>
          ) : null}
          {allowed.includes("mail") ? (
            <button type="button" className={method === "mail" ? "on" : ""} onClick={() => setMethod("mail")}>Email</button>
          ) : null}
        </div>
      ) : null}

      {method === "derived" ? (
        <>
          <div className="note" style={{ marginTop: 0 }}>
            Derives a dedicated EVM key from your seed and signs the challenge in-app — no external
            wallet. The onramped USDC lands on this address, ready to shield.
          </div>
          <div className="actions" style={{ marginTop: 14 }}>
            <Button variant="solid" arrow onClick={() => dfx.connect("derived", { mnemonic })} disabled={dfx.busy}>
              {dfx.busy ? "Signing in…" : "Sign in"}
            </Button>
          </div>
        </>
      ) : method === "wallet" ? (
        <>
          <div className="note" style={{ marginTop: 0 }}>
            {hasInjectedWallet()
              ? "Connect MetaMask / a browser wallet to sign in and receive the onramped USDC."
              : "No browser wallet detected — install MetaMask, or use the in-app key method."}
          </div>
          <div className="actions" style={{ marginTop: 14 }}>
            <Button variant="solid" arrow onClick={() => dfx.connect("wallet")} disabled={dfx.busy || !hasInjectedWallet()}>
              {dfx.busy ? "Connecting…" : "Connect browser wallet"}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="note" style={{ marginTop: 0 }}>
            Sign in with your email — we'll send a confirmation link to verify it's you.
          </div>
          <div className="field" style={{ marginTop: 0 }}>
            <label>EMAIL</label>
            <input className="input" type="email" value={mail} onChange={(e) => setMail(e.target.value)} placeholder="you@example.com" />
          </div>
          <div className="actions" style={{ marginTop: 14 }}>
            <Button variant="solid" arrow onClick={() => dfx.connect("mail", { mail: mail.trim() })} disabled={dfx.busy || !mail.trim()}>
              {dfx.busy ? <>Sending<Dots /></> : "Send confirmation link"}
            </Button>
          </div>
        </>
      )}
      {dfx.error ? <div className="note" style={{ color: "var(--bad)" }}>{dfx.error}</div> : null}
    </div>
  );
}
