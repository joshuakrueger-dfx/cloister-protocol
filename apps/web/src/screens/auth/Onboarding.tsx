// Onboarding/Auth-Flow (NEU, nicht im Prototyp).
// 4 Schritte: (a) Seed erstellen/importieren, (b) Vault-Passwort,
// (c) KYC (entity/individual, simulierte Verifikation → verified-Badge),
// (d) optional "Continue with DFX account".
// Reine UI + Mock-State. Nach Abschluss → Console.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../../lib/ApiProvider";
import { useSession } from "../../lib/SessionProvider";
import { Logo } from "../../components/icons";
import { Dots } from "../../components/primitives";
import { DfxConnect } from "../../components/DfxConnect";
import { vaultExists, clearVault } from "../../lib/vault";
import type { Jurisdiction, KycSubjectType, ProofStep, Wallet } from "../../lib/types";

type Step = 0 | 1 | 2 | 3;

export function Onboarding() {
  const api = useApi();
  const nav = useNavigate();
  const { setSession } = useSession();
  const [step, setStep] = useState<Step>(0);

  // Wiederkehrender Nutzer: ein verschlüsselter Vault existiert auf diesem Gerät → entsperren.
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

  // Schritt 0 — Seed
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [creatingSeed, setCreatingSeed] = useState(false);
  const [importMode, setImportMode] = useState(false);
  const [importText, setImportText] = useState("");

  // Schritt 1 — Passwort
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  // Schritt 2 — KYC
  const [subject, setSubject] = useState<KycSubjectType>("entity");
  const [jurisdiction, setJurisdiction] = useState<Jurisdiction>("EU");
  const [legalName, setLegalName] = useState("");
  const [country, setCountry] = useState("");
  const [idType, setIdType] = useState("passport");
  const [idNumber, setIdNumber] = useState("");
  const [dob, setDob] = useState("");
  const [kycLines, setKycLines] = useState<ProofStep[]>([]);
  const [kycProgress, setKycProgress] = useState(0);
  const [kycBusy, setKycBusy] = useState(false);
  const [kycDone, setKycDone] = useState(false);
  const [kycError, setKycError] = useState<string | null>(null);

  // Schritt 3 — DFX / Enter
  const [showDfx, setShowDfx] = useState(false);

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

  async function submitKyc() {
    setKycBusy(true);
    setKycLines([]);
    setKycProgress(0);
    setKycError(null);
    try {
      await api.submitKyc(
        { subjectType: subject, jurisdiction, legalName, country, idType, idNumber, dateOfBirth: dob },
        (s) => {
          setKycProgress(s.progress);
          setKycLines((p) => [...p, s]);
        },
      );
      setKycDone(true);
    } catch (e) {
      // Screening kann ablehnen (Embargo/Sanktionen/fehlende Felder) → Flow bricht ab.
      setKycError(e instanceof Error ? e.message : "Verification failed.");
    } finally {
      setKycBusy(false);
    }
  }

  const COUNTRIES_EU = [
    ["", "Select country"], ["CH", "Switzerland"], ["DE", "Germany"], ["FR", "France"], ["IT", "Italy"],
    ["ES", "Spain"], ["NL", "Netherlands"], ["AT", "Austria"], ["PT", "Portugal"], ["IE", "Ireland"],
    ["IR", "Iran (embargoed)"],
  ];
  const COUNTRIES_US = [
    ["", "Select state/country"], ["US", "United States"], ["CA", "Canada"], ["KP", "North Korea (embargoed)"],
  ];

  async function enterConsole() {
    const session = await api.getSession();
    setSession(session);
    nav("/overview");
  }

  // DFX account linked (real api.dfx.swiss session lives in the DFX layer) —
  // flag it on the local session and enter the console.
  async function enterWithDfx() {
    localStorage.setItem("cloister.dfx", "true");
    await enterConsole();
  }

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
          {[0, 1, 2, 3].map((i) => (
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

        {/* ---- Step 2: KYC ---- */}
        {step === 2 ? (
          <>
            <h2>Verify identity</h2>
            <p className="hint">
              The one-time public touchpoint. Pick your regulatory home — the console then shows
              only that jurisdiction's rules. KYC + sanctions screening run here so every later
              payout proves clean origin without revealing history.
            </p>
            <div className="field">
              <label>REGULATORY JURISDICTION</label>
              <div className="seg">
                <button type="button" className={jurisdiction === "EU" ? "on" : ""} onClick={() => { setJurisdiction("EU"); setCountry(""); }}>
                  EU-based
                </button>
                <button type="button" className={jurisdiction === "US" ? "on" : ""} onClick={() => { setJurisdiction("US"); setCountry(""); }}>
                  US-based
                </button>
              </div>
            </div>
            <div className="field">
              <label>SUBJECT</label>
              <div className="seg">
                <button type="button" className={subject === "entity" ? "on" : ""} onClick={() => setSubject("entity")}>
                  Entity / DAO
                </button>
                <button type="button" className={subject === "individual" ? "on" : ""} onClick={() => setSubject("individual")}>
                  Individual
                </button>
              </div>
            </div>
            <div className="field">
              <label>{subject === "entity" ? "LEGAL ENTITY NAME" : "FULL NAME"}</label>
              <input className="input" value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder={subject === "entity" ? "e.g. Acme GmbH" : "e.g. Jane Doe"} />
            </div>
            <div className="grid g2">
              <div className="field" style={{ marginTop: 0 }}>
                <label>{jurisdiction === "EU" ? "COUNTRY" : "STATE / COUNTRY"}</label>
                <select className="input" value={country} onChange={(e) => setCountry(e.target.value)}>
                  {(jurisdiction === "EU" ? COUNTRIES_EU : COUNTRIES_US).map(([code, name]) => (
                    <option key={code} value={code}>{name}</option>
                  ))}
                </select>
              </div>
              <div className="field" style={{ marginTop: 0 }}>
                <label>ID TYPE</label>
                <select className="input" value={idType} onChange={(e) => setIdType(e.target.value)}>
                  {subject === "entity" ? <option value="registration">Company registration</option> : <option value="passport">Passport</option>}
                  {subject === "entity" ? <option value="lei">LEI</option> : <option value="national_id">National ID</option>}
                </select>
              </div>
            </div>
            <div className="grid g2">
              <div className="field" style={{ marginTop: 0 }}>
                <label>{subject === "entity" ? "REGISTRATION NO." : "ID NUMBER"}</label>
                <input className="input" value={idNumber} onChange={(e) => setIdNumber(e.target.value)} placeholder="e.g. CHE-123.456.789" />
              </div>
              {subject === "individual" ? (
                <div className="field" style={{ marginTop: 0 }}>
                  <label>DATE OF BIRTH</label>
                  <input className="input" type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
                </div>
              ) : <div />}
            </div>

            {kycError ? (
              <p className="hint" style={{ color: "var(--bad)" }}>{kycError}</p>
            ) : null}

            {kycLines.length ? (
              <>
                <div className="progress kyc-progress">
                  <i style={{ width: `${kycProgress}%` }} />
                </div>
                <div className="console">
                  {kycLines.map((l, i) => (
                    <div key={i} dangerouslySetInnerHTML={{ __html: `cloister> ${l.html}` }} />
                  ))}
                </div>
              </>
            ) : null}

            <div className="stack">
              {kycDone ? (
                <button className="btn btn-solid full" onClick={() => setStep(3)}>
                  Verified — continue <span className="arr">→</span>
                </button>
              ) : (
                <button className="btn btn-solid full" onClick={submitKyc} disabled={kycBusy}>
                  {kycBusy ? <>Verifying<Dots /></> : "Submit for verification"}
                </button>
              )}
            </div>
          </>
        ) : null}

        {/* ---- Step 3: Enter / DFX ---- */}
        {step === 3 ? (
          <>
            <h2>You're set</h2>
            <p className="hint">
              Your vault is created, secured and KYC-verified at level L3. Enter the console — or
              link a DFX account for fiat onramp (bank → USDC) straight into the shielded pool.
            </p>
            {showDfx ? (
              <>
                <DfxConnect mnemonic={wallet?.seedWords.join(" ")} onVerified={enterWithDfx} />
                <div className="stack">
                  <button className="btn full" onClick={enterWithDfx}>
                    Enter console <span className="arr">→</span>
                  </button>
                </div>
              </>
            ) : (
              <div className="stack">
                <button className="btn btn-solid full" onClick={enterConsole}>
                  Enter console <span className="arr">→</span>
                </button>
                <button className="btn full" onClick={() => setShowDfx(true)}>
                  Continue with DFX account
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
