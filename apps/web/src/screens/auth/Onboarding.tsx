// Onboarding / Auth flow.
// 3 steps: (a) create/import seed, (b) vault password, (c) verify email via a
// one-time code. Full identity verification (KYC) now happens later in the
// dashboard (account-based), so the entry barrier here is just a confirmed email.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../../lib/ApiProvider";
import { useSession } from "../../lib/SessionProvider";
import { Logo } from "../../components/icons";
import { Dots } from "../../components/primitives";
import { vaultExists, clearVault } from "../../lib/vault";
import { confirmDialog } from "../../lib/overlays";
import { useT } from "../../lib/i18n";
import type { Wallet } from "../../lib/types";

type Step = 0 | 1 | 2;

export function Onboarding() {
  const api = useApi();
  const nav = useNavigate();
  const tr = useT();
  const { setSession } = useSession();
  const [step, setStep] = useState<Step>(0);

  // Returning user: an encrypted vault exists on this device → unlock.
  const [unlockMode, setUnlockMode] = useState(() => vaultExists());
  const [unlockPw, setUnlockPw] = useState("");
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);

  async function doUnlock() {
    setUnlockError(null);
    setUnlockBusy(true);
    try {
      await api.unlock(unlockPw);
      setSession(await api.getSession());
      nav("/overview");
    } catch (e) {
      setUnlockError(e instanceof Error ? e.message : tr("Could not unlock.", "Konnte nicht entsperren."));
    } finally {
      setUnlockBusy(false);
    }
  }

  // Step 0 — Seed
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [creatingSeed, setCreatingSeed] = useState(false);
  const [importMode, setImportMode] = useState(false);
  const [importText, setImportText] = useState("");

  // Step 1 — Password
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  // Step 2 — Verify email (one-time code)
  const [email, setEmail] = useState("");
  const [sentCode, setSentCode] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [emailVerified, setEmailVerified] = useState(false);

  async function createSeed() {
    setCreatingSeed(true);
    try {
      setWallet(await api.createWallet());
    } finally {
      setCreatingSeed(false);
    }
  }

  async function importSeed() {
    const words = importText.trim().split(/\s+/);
    setCreatingSeed(true);
    try {
      setWallet(await api.createWallet(words.length === 12 || words.length === 24 ? words : undefined));
      setStep(1);
    } finally {
      setCreatingSeed(false);
    }
  }

  async function setPassword() {
    setPwError(null);
    if (pw.length < 6) return setPwError(tr("Password must be at least 6 characters.", "Passwort muss mindestens 6 Zeichen haben."));
    if (pw !== pw2) return setPwError(tr("Passwords do not match.", "Passwörter stimmen nicht überein."));
    setPwBusy(true);
    try {
      await api.unlock(pw);
      setStep(2);
    } catch (e) {
      setPwError(e instanceof Error ? e.message : tr("Could not set password.", "Konnte Passwort nicht setzen."));
    } finally {
      setPwBusy(false);
    }
  }

  // PoC: there is no email backend yet, so the one-time code is generated on the
  // device and shown below.
  function sendCode() {
    setEmailErr(null);
    const e = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return setEmailErr(tr("Enter a valid email address.", "Bitte eine gültige E-Mail-Adresse eingeben."));
    setSentCode(String(Math.floor(100000 + Math.random() * 900000)));
    setCodeInput("");
  }

  async function verifyCode() {
    setEmailErr(null);
    if (codeInput.trim() !== sentCode) return setEmailErr(tr("That code doesn't match — check it and try again.", "Code stimmt nicht — bitte prüfen und erneut versuchen."));
    setEmailBusy(true);
    try {
      setSession(await api.confirmEmail(email.trim()));
      setEmailVerified(true);
    } catch (e) {
      setEmailErr(e instanceof Error ? e.message : tr("Could not verify.", "Konnte nicht verifizieren."));
    } finally {
      setEmailBusy(false);
    }
  }

  async function enterConsole() {
    setSession(await api.getSession());
    nav("/overview");
  }

  const linkBtn: React.CSSProperties = {
    background: "none", border: "none", color: "var(--white)", textDecoration: "underline",
    cursor: "pointer", font: "inherit", padding: 0,
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="brand">
          <Logo />
          <span>
            CLOISTER <span className="sub">CONSOLE</span>
          </span>
        </div>
        {unlockMode ? (
          <>
            <h2>{tr("Unlock your vault", "Vault entsperren")}</h2>
            <p className="hint">
              {tr(
                "A Cloister vault is stored on this device. Enter your password to decrypt your keys.",
                "Auf diesem Gerät ist ein Cloister-Vault gespeichert. Gib dein Passwort ein, um deine Schlüssel zu entschlüsseln.",
              )}
            </p>
            <div className="field">
              <label>{tr("PASSWORD", "PASSWORT")}</label>
              <input
                className="input"
                type="password"
                value={unlockPw}
                onChange={(e) => setUnlockPw(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && doUnlock()}
                autoFocus
              />
            </div>
            {unlockError ? (
              <p className="hint" style={{ color: "var(--bad)" }}>{unlockError}</p>
            ) : null}
            <div className="stack">
              <button className="btn btn-solid full" onClick={doUnlock} disabled={unlockBusy}>
                {unlockBusy ? (
                  <>{tr("Unlocking", "Entsperren")}<Dots /></>
                ) : (
                  <>{tr("Unlock", "Entsperren")} <span className="arr">→</span></>
                )}
              </button>
              <button
                className="btn full"
                onClick={async () => {
                  const ok = await confirmDialog({
                    title: tr("Start over with a different seed?", "Mit anderem Seed neu beginnen?"),
                    body: tr(
                      "This discards the vault on this device. It can't be undone without your seed phrase.",
                      "Das verwirft den Vault auf diesem Gerät. Ohne deine Seed-Phrase nicht rückgängig zu machen.",
                    ),
                    confirmLabel: tr("Discard vault", "Vault verwerfen"),
                    danger: true,
                  });
                  if (ok) {
                    clearVault();
                    setUnlockMode(false);
                  }
                }}
              >
                {tr("Use a different seed", "Anderen Seed verwenden")}
              </button>
            </div>
          </>
        ) : (
        <>
        <div className="auth-steps">
          {[0, 1, 2].map((i) => (
            <span className={`dot${i <= step ? " on" : ""}`} key={i} />
          ))}
        </div>

        {/* ---- Step 0: Seed ---- */}
        {step === 0 ? (
          <>
            <h2>{tr("Create your vault", "Vault erstellen")}</h2>
            <p className="hint">
              {tr(
                "Cloister is self-custody. Your spend, view and nullifier keys derive from one seed phrase and never leave this device.",
                "Cloister ist selbstverwahrend. Deine Spend-, View- und Nullifier-Schlüssel leiten sich aus einer Seed-Phrase ab und verlassen dieses Gerät nie.",
              )}
            </p>
            {!importMode ? (
              <>
                {wallet ? (
                  <>
                    <div className="seed-grid">
                      {wallet.seedWords.map((w, i) => (
                        <span className="seed-word" key={i}>
                          <i>{i + 1}</i>
                          {w}
                        </span>
                      ))}
                    </div>
                    <p className="hint">
                      {tr(
                        `Write these ${wallet.seedWords.length} words down. Anyone with them controls the vault.`,
                        `Schreib diese ${wallet.seedWords.length} Wörter auf. Wer sie hat, kontrolliert den Vault.`,
                      )}
                    </p>
                    <div className="stack">
                      <button className="btn btn-solid full" onClick={() => setStep(1)}>
                        {tr("I've saved it — continue", "Gespeichert — weiter")} <span className="arr">→</span>
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="stack">
                    <button className="btn btn-solid full" onClick={createSeed} disabled={creatingSeed}>
                      {creatingSeed ? <>{tr("Generating", "Erzeuge")}<Dots /></> : tr("Generate seed phrase", "Seed-Phrase erzeugen")}
                    </button>
                  </div>
                )}
                <div className="divider">{tr("OR", "ODER")}</div>
                <button className="btn full" onClick={() => setImportMode(true)}>
                  {tr("Import existing seed", "Bestehenden Seed importieren")}
                </button>
              </>
            ) : (
              <>
                <div className="field">
                  <label>{tr("SEED PHRASE (12 or 24 words)", "SEED-PHRASE (12 oder 24 Wörter)")}</label>
                  <textarea
                    className="input"
                    rows={3}
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    placeholder="word1 word2 word3 …"
                  />
                </div>
                <div className="stack">
                  <button className="btn btn-solid full" onClick={importSeed} disabled={creatingSeed}>
                    {creatingSeed ? <>{tr("Importing", "Importiere")}<Dots /></> : tr("Import & continue", "Importieren & weiter")}
                  </button>
                  <button className="btn full" onClick={() => setImportMode(false)}>
                    {tr("Back", "Zurück")}
                  </button>
                </div>
              </>
            )}
          </>
        ) : null}

        {/* ---- Step 1: Password ---- */}
        {step === 1 ? (
          <>
            <h2>{tr("Set a vault password", "Vault-Passwort festlegen")}</h2>
            <p className="hint">
              {tr(
                "Encrypts the local note cache and your keys on this device. Required on every unlock.",
                "Verschlüsselt den lokalen Notiz-Cache und deine Schlüssel auf diesem Gerät. Bei jedem Entsperren nötig.",
              )}
            </p>
            <div className="field">
              <label>{tr("PASSWORD", "PASSWORT")}</label>
              <input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
            </div>
            <div className="field">
              <label>{tr("CONFIRM PASSWORD", "PASSWORT BESTÄTIGEN")}</label>
              <input className="input" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
            </div>
            {pwError ? <p className="hint" style={{ color: "var(--bad)" }}>{pwError}</p> : null}
            <div className="stack">
              <button className="btn btn-solid full" onClick={setPassword} disabled={pwBusy}>
                {pwBusy ? (
                  <>{tr("Securing", "Sichere")}<Dots /></>
                ) : (
                  <>{tr("Set password & continue", "Passwort setzen & weiter")} <span className="arr">→</span></>
                )}
              </button>
            </div>
          </>
        ) : null}

        {/* ---- Step 2: Verify email ---- */}
        {step === 2 ? (
          <>
            <h2>{tr("Verify your email", "E-Mail verifizieren")}</h2>
            <p className="hint">
              {tr(
                "Confirm your email to finish creating your account — that's all you need to start. Full identity verification (KYC) happens later in the dashboard, when you're ready to move real funds.",
                "Bestätige deine E-Mail, um dein Konto fertig anzulegen — mehr brauchst du für den Start nicht. Die vollständige Identitätsprüfung (KYC) folgt später im Dashboard, wenn du echtes Geld bewegen willst.",
              )}
            </p>

            {!emailVerified ? (
              <>
                <div className="field">
                  <label>{tr("EMAIL", "E-MAIL")}</label>
                  <input
                    className="input"
                    type="email"
                    value={email}
                    disabled={!!sentCode}
                    onChange={(e) => { setEmail(e.target.value); setSentCode(null); }}
                    onKeyDown={(e) => e.key === "Enter" && !sentCode && sendCode()}
                    placeholder="you@example.com"
                    autoFocus
                  />
                </div>

                {sentCode ? (
                  <>
                    <div className="field">
                      <label>{tr("6-DIGIT CODE", "6-STELLIGER CODE")}</label>
                      <input
                        className="input"
                        inputMode="numeric"
                        maxLength={6}
                        value={codeInput}
                        onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, ""))}
                        onKeyDown={(e) => e.key === "Enter" && verifyCode()}
                        placeholder="123456"
                        autoFocus
                      />
                    </div>
                    <p className="hint" style={{ marginTop: 0 }}>
                      {tr("We sent a code to", "Code gesendet an")} <b>{email.trim()}</b>.{" "}
                      <button type="button" style={linkBtn} onClick={() => setSentCode(null)}>{tr("change email", "E-Mail ändern")}</button>
                      {" · "}
                      <button type="button" style={linkBtn} onClick={sendCode}>{tr("resend", "erneut senden")}</button>
                    </p>
                    <div className="note">{tr("For this preview, your code is", "Für diese Vorschau lautet dein Code")} <b>{sentCode}</b>.</div>
                  </>
                ) : null}

                {emailErr ? <p className="hint" style={{ color: "var(--bad)" }}>{emailErr}</p> : null}

                <div className="stack">
                  {!sentCode ? (
                    <button className="btn btn-solid full" onClick={sendCode}>
                      {tr("Send code", "Code senden")} <span className="arr">→</span>
                    </button>
                  ) : (
                    <button className="btn btn-solid full" onClick={verifyCode} disabled={emailBusy || codeInput.length < 6}>
                      {emailBusy ? <>{tr("Verifying", "Verifiziere")}<Dots /></> : <>{tr("Verify", "Verifizieren")} <span className="arr">→</span></>}
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="stack">
                <div className="note">
                  <span className="ok">✓</span> {tr(
                    "Email verified. You're all set — identity verification is waiting for you in the dashboard, whenever you want to move real funds.",
                    "E-Mail verifiziert. Alles bereit — die Identitätsprüfung wartet im Dashboard, wann immer du echtes Geld bewegen willst.",
                  )}
                </div>
                <button className="btn btn-solid full" onClick={enterConsole}>
                  {tr("Enter console", "Zur Konsole")} <span className="arr">→</span>
                </button>
              </div>
            )}
          </>
        ) : null}
        </>
        )}
      </div>
    </div>
  );
}
