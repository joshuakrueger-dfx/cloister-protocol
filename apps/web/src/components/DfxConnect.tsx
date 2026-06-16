// DFX connect panel — sign in to api.dfx.swiss with one of three methods,
// then show live KYC status and a Start-KYC handoff. Reused by the onboarding
// "Continue with DFX" step and the Fund onramp. The actual document KYC and
// SEPA transfer happen out-of-band in DFX's own flow.

import { useState } from "react";
import { useDfx } from "../lib/dfx/useDfx";
import { hasInjectedWallet, type DfxAuthMethod } from "../lib/dfx";
import { Button, Dots } from "./primitives";
import { useT } from "../lib/i18n";

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
  const tr = useT();
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
          {tr("ACCOUNT", "KONTO")} — {dfx.method === "mail" ? tr("EMAIL", "E-MAIL") : SHORT(dfx.address).toUpperCase()}
        </div>
        <div className="kv">
          <span className="k">{tr("KYC level", "KYC-Stufe")}</span>
          <span className="v">{kyc ? `${kyc.level} · ${kyc.status}` : tr("loading…", "lädt…")}</span>
        </div>
        {kyc ? (
          <div className="kv">
            <span className="k">{tr("Trading limit", "Handelslimit")}</span>
            <span className="v">{kyc.tradingLimit.limit.toLocaleString("en-US")} / {kyc.tradingLimit.period.toLowerCase()}</span>
          </div>
        ) : null}
        {dfx.error ? <div className="note" style={{ color: "var(--bad)" }}>{dfx.error}</div> : null}
        <div className="actions" style={{ marginTop: 14 }}>
          {verified ? (
            onVerified ? (
              <Button variant="solid" arrow onClick={onVerified}>{tr("Continue", "Weiter")}</Button>
            ) : (
              <span className="tag-ok" style={{ alignSelf: "center" }}>{tr("KYC verified", "KYC verifiziert")}</span>
            )
          ) : (
            <Button variant="solid" arrow onClick={() => dfx.startKyc()} disabled={dfx.busy}>
              {dfx.busy ? tr("Opening…", "Öffne…") : tr("Start / continue KYC", "KYC starten / fortsetzen")}
            </Button>
          )}
          <Button onClick={dfx.disconnect}>{tr("Disconnect", "Trennen")}</Button>
        </div>
        {!verified ? (
          <div className="note">
            {tr(
              "KYC runs in a regulated flow (real identity documents, a real person). Complete it in the opened tab, then return — your level updates here.",
              "KYC läuft in einem regulierten Prozess (echte Ausweisdokumente, eine echte Person). Schließe es im geöffneten Tab ab und komm zurück — deine Stufe aktualisiert sich hier.",
            )}
          </div>
        ) : null}
      </div>
    );
  }

  // ---------- email confirmation pending (magic link) ----------
  if (dfx.awaitingOtp) {
    return (
      <div className="gatebox" style={compact ? { marginTop: 12 } : undefined}>
        <div className="clab" style={{ marginBottom: 10 }}>{tr("CHECK YOUR EMAIL", "PRÜFE DEINE E-MAIL")}</div>
        <div className="note" style={{ marginTop: 0 }}>
          {tr("A confirmation link was emailed to you. Open it and click", "Wir haben dir einen Bestätigungslink gesendet. Öffne ihn und klicke")} <b>{tr("confirm", "bestätigen")}</b>{tr(" — then come back here and continue. (The link can't return to localhost, so you confirm manually.)", " — dann komm hierher zurück und mach weiter. (Der Link kann nicht zu localhost zurück, daher bestätigst du manuell.)")}
        </div>
        {dfx.error ? <div className="note" style={{ color: "var(--bad)" }}>{dfx.error}</div> : null}
        <div className="actions" style={{ marginTop: 14 }}>
          <Button variant="solid" arrow onClick={() => dfx.confirmMail()} disabled={dfx.busy}>
            {dfx.busy ? <>{tr("Checking", "Prüfe")}<Dots /></> : tr("I've confirmed — continue", "Ich habe bestätigt — weiter")}
          </Button>
        </div>
      </div>
    );
  }

  // ---------- not connected ----------
  return (
    <div className={compact ? "" : "gatebox"} style={compact ? { marginTop: 12 } : undefined}>
      {!compact ? <div className="clab" style={{ marginBottom: 10 }}>{tr("CONNECT ACCOUNT", "KONTO VERBINDEN")}</div> : null}
      {allowed.length > 1 ? (
        <div className="seg" style={{ marginBottom: 14 }}>
          {allowed.includes("derived") ? (
            <button type="button" className={method === "derived" ? "on" : ""} onClick={() => setMethod("derived")}>{tr("In-app key", "In-App-Key")}</button>
          ) : null}
          {allowed.includes("wallet") ? (
            <button type="button" className={method === "wallet" ? "on" : ""} onClick={() => setMethod("wallet")}>{tr("Browser wallet", "Browser-Wallet")}</button>
          ) : null}
          {allowed.includes("mail") ? (
            <button type="button" className={method === "mail" ? "on" : ""} onClick={() => setMethod("mail")}>{tr("Email", "E-Mail")}</button>
          ) : null}
        </div>
      ) : null}

      {method === "derived" ? (
        <>
          <div className="note" style={{ marginTop: 0 }}>
            {tr(
              "Derives a dedicated EVM key from your seed and signs the challenge in-app — no external wallet. The onramped USDC lands on this address, ready to shield.",
              "Leitet einen eigenen EVM-Key aus deiner Seed ab und signiert die Challenge in der App — ohne externes Wallet. Das eingekaufte USDC landet auf dieser Adresse, bereit zum Abschirmen.",
            )}
          </div>
          <div className="actions" style={{ marginTop: 14 }}>
            <Button variant="solid" arrow onClick={() => dfx.connect("derived", { mnemonic })} disabled={dfx.busy}>
              {dfx.busy ? tr("Signing in…", "Melde an…") : tr("Sign in", "Anmelden")}
            </Button>
          </div>
        </>
      ) : method === "wallet" ? (
        <>
          <div className="note" style={{ marginTop: 0 }}>
            {hasInjectedWallet()
              ? tr("Connect MetaMask / a browser wallet to sign in and receive the onramped USDC.", "Verbinde MetaMask / ein Browser-Wallet, um dich anzumelden und das eingekaufte USDC zu erhalten.")
              : tr("No browser wallet detected — install MetaMask, or use the in-app key method.", "Kein Browser-Wallet erkannt — installiere MetaMask oder nutze die In-App-Key-Methode.")}
          </div>
          <div className="actions" style={{ marginTop: 14 }}>
            <Button variant="solid" arrow onClick={() => dfx.connect("wallet")} disabled={dfx.busy || !hasInjectedWallet()}>
              {dfx.busy ? tr("Connecting…", "Verbinde…") : tr("Connect browser wallet", "Browser-Wallet verbinden")}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="note" style={{ marginTop: 0 }}>
            {tr("Sign in with your email — we'll send a confirmation link to verify it's you.", "Melde dich mit deiner E-Mail an — wir senden einen Bestätigungslink, um dich zu verifizieren.")}
          </div>
          <div className="field" style={{ marginTop: 0 }}>
            <label>{tr("EMAIL", "E-MAIL")}</label>
            <input className="input" type="email" value={mail} onChange={(e) => setMail(e.target.value)} placeholder="you@example.com" />
          </div>
          <div className="actions" style={{ marginTop: 14 }}>
            <Button variant="solid" arrow onClick={() => dfx.connect("mail", { mail: mail.trim() })} disabled={dfx.busy || !mail.trim()}>
              {dfx.busy ? <>{tr("Sending", "Sende")}<Dots /></> : tr("Send confirmation link", "Bestätigungslink senden")}
            </Button>
          </div>
        </>
      )}
      {dfx.error ? <div className="note" style={{ color: "var(--bad)" }}>{dfx.error}</div> : null}
    </div>
  );
}
