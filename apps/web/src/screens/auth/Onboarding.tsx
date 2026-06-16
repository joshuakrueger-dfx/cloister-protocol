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
import type { Wallet } from "../../lib/types";

type Step = 0 | 1 | 2;

export function Onboarding() {
  const api = useApi();
  const nav = useNavigate();
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
      setUnlockError(e instanceof Error ? e.message : "Could not unlock.");
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
    if (pw.length < 6) return setPwError("Password must be at least 6 characters.");
    if (pw !== pw2) return setPwError("Passwords do not match.");
    setPwBusy(true);
    try {
      await api.unlock(pw);
      setStep(2);
    } catch (e) {
      setPwError(e instanceof Error ? e.message : "Could not set password.");
    } finally {
      setPwBusy(false);
    }
  }

  // PoC: there is no email backend yet, so the one-time code is generated on the
  // device and shown below. (When a mail service is wired in, only `sendCode`
  // changes — the verify step stays the same.)
  function sendCode() {
    setEmailErr(null);
    const e = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return setEmailErr("Enter a valid email address.");
    setSentCode(String(Math.floor(100000 + Math.random() * 900000)));
    setCodeInput("");
  }

  async function verifyCode() {
    setEmailErr(null);
    if (codeInput.trim() !== sentCode) return setEmailErr("That code doesn't match — check it and try again.");
    setEmailBusy(true);
    try {
      setSession(await api.confirmEmail(email.trim()));
      setEmailVerified(true);
    } catch (e) {
      setEmailErr(e instanceof Error ? e.message : "Could not verify.");
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
            <h2>Unlock your vault</h2>
            <p className="hint">
              A Cloister vault is stored on this device. Enter your password to decrypt your keys.
            </p>
            <div className="field">
              <label>PASSWORD</label>
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
              <p className="hint" style={{ color: "var(--bad)" }}>
                {unlockError}
              </p>
            ) : null}
            <div className="stack">
              <button className="btn btn-solid full" onClick={doUnlock} disabled={unlockBusy}>
                {unlockBusy ? (
                  <>Unlocking<Dots /></>
                ) : (
                  <>Unlock <span className="arr">→</span></>
                )}
              </button>
              <button
                className="btn full"
                onClick={() => {
                  if (confirm("Discard the vault on this device and start over? This cannot be undone without your seed phrase.")) {
                    clearVault();
                    setUnlockMode(false);
                  }
                }}
              >
                Use a different seed
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
            <h2>Create your vault</h2>
            <p className="hint">
              Cloister is self-custody. Your spend, view and nullifier keys derive from one seed
              phrase and never leave this device.
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
                    <p className="hint">Write these {wallet.seedWords.length} words down. Anyone with them controls the vault.</p>
                    <div className="stack">
                      <button className="btn btn-solid full" onClick={() => setStep(1)}>
                        I've saved it — continue <span className="arr">→</span>
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="stack">
                    <button className="btn btn-solid full" onClick={createSeed} disabled={creatingSeed}>
                      {creatingSeed ? <>Generating<Dots /></> : "Generate seed phrase"}
                    </button>
                  </div>
                )}
                <div className="divider">OR</div>
                <button className="btn full" onClick={() => setImportMode(true)}>
                  Import existing seed
                </button>
              </>
            ) : (
              <>
                <div className="field">
                  <label>SEED PHRASE (12 or 24 words)</label>
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
                    {creatingSeed ? <>Importing<Dots /></> : "Import & continue"}
                  </button>
                  <button className="btn full" onClick={() => setImportMode(false)}>
                    Back
                  </button>
                </div>
              </>
            )}
          </>
        ) : null}

        {/* ---- Step 1: Password ---- */}
        {step === 1 ? (
          <>
            <h2>Set a vault password</h2>
            <p className="hint">
              Encrypts the local note cache and your keys on this device. Required on every unlock.
            </p>
            <div className="field">
              <label>PASSWORD</label>
              <input
                className="input"
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
              />
            </div>
            <div className="field">
              <label>CONFIRM PASSWORD</label>
              <input
                className="input"
                type="password"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
              />
            </div>
            {pwError ? (
              <p className="hint" style={{ color: "var(--bad)" }}>
                {pwError}
              </p>
            ) : null}
            <div className="stack">
              <button className="btn btn-solid full" onClick={setPassword} disabled={pwBusy}>
                {pwBusy ? (
                  <>Securing<Dots /></>
                ) : (
                  <>Set password & continue <span className="arr">→</span></>
                )}
              </button>
            </div>
          </>
        ) : null}

        {/* ---- Step 2: Verify email ---- */}
        {step === 2 ? (
          <>
            <h2>Verify your email</h2>
            <p className="hint">
              Confirm your email to finish creating your account — that's all you need to start.
              Full identity verification (KYC) happens later in the dashboard, when you're ready to
              move real funds.
            </p>

            {!emailVerified ? (
              <>
                <div className="field">
                  <label>EMAIL</label>
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
                      <label>6-DIGIT CODE</label>
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
                      We sent a code to <b>{email.trim()}</b>.{" "}
                      <button type="button" style={linkBtn} onClick={() => setSentCode(null)}>change email</button>
                      {" · "}
                      <button type="button" style={linkBtn} onClick={sendCode}>resend</button>
                    </p>
                    <div className="note">For this preview, your code is <b>{sentCode}</b>.</div>
                  </>
                ) : null}

                {emailErr ? <p className="hint" style={{ color: "var(--bad)" }}>{emailErr}</p> : null}

                <div className="stack">
                  {!sentCode ? (
                    <button className="btn btn-solid full" onClick={sendCode}>
                      Send code <span className="arr">→</span>
                    </button>
                  ) : (
                    <button className="btn btn-solid full" onClick={verifyCode} disabled={emailBusy || codeInput.length < 6}>
                      {emailBusy ? <>Verifying<Dots /></> : <>Verify <span className="arr">→</span></>}
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="stack">
                <div className="note">
                  <span className="ok">✓</span> Email verified. You're all set — identity verification
                  is waiting for you in the dashboard, whenever you want to move real funds.
                </div>
                <button className="btn btn-solid full" onClick={enterConsole}>
                  Enter console <span className="arr">→</span>
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
