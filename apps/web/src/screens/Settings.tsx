import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, ComplianceList, Field, ScreenHead } from "../components/primitives";
import { useApi } from "../lib/ApiProvider";
import { useSession } from "../lib/SessionProvider";
import { getActiveBackendId, getBackendConfig } from "../lib/backends";
import { clearVault } from "../lib/vault";

const SHOW_BAL_KEY = "cloister.showBalances";

export function Settings() {
  const api = useApi();
  const nav = useNavigate();
  const { session, setSession } = useSession();
  const backend = getBackendConfig(getActiveBackendId());
  const dfxLinked = session?.dfxLinked ?? false;

  const [name, setName] = useState(session?.org.name ?? "");
  const [email, setEmail] = useState(session?.email ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showBalances, setShowBalances] = useState(() => {
    try { return localStorage.getItem(SHOW_BAL_KEY) === "1"; } catch { return false; }
  });

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      setSession(await api.updateProfile({ name, email }));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  function toggleShowBalances() {
    const v = !showBalances;
    setShowBalances(v);
    try { localStorage.setItem(SHOW_BAL_KEY, v ? "1" : "0"); } catch { /* ignore */ }
  }

  function signOut() {
    if (confirm("Sign out and remove the vault on this device? You'll need your seed phrase to restore it.")) {
      clearVault();
      nav("/welcome");
      location.reload();
    }
  }

  return (
    <section className="view">
      <ScreenHead
        eyebrow="ACCOUNT"
        title="Settings"
        sub="Self-custody. Your spend / view / nullifier keys derive from one seed and never leave the device. Notes are recoverable from chain history via the viewing key."
      />
      <div className="grid g2" style={{ marginTop: 24 }}>
        {/* ---- editable profile ---- */}
        <Card>
          <div className="clab">PROFILE</div>
          <Field label="ACCOUNT NAME">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acme GmbH" />
          </Field>
          <Field label="CONTACT EMAIL">
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </Field>
          <div className="actions" style={{ alignItems: "center", gap: 12 }}>
            <Button variant="solid" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
            {saved ? <span style={{ color: "var(--ok)", fontSize: 13 }}>✓ Saved</span> : null}
          </div>
        </Card>

        {/* ---- preferences ---- */}
        <Card>
          <div className="clab">PREFERENCES</div>
          <div className="set-row">
            <div>
              <div className="set-t">Show balances by default</div>
              <div className="set-s">When off, amounts stay masked until you tap “reveal”.</div>
            </div>
            <button
              type="button"
              className={`toggle${showBalances ? " on" : ""}`}
              onClick={toggleShowBalances}
              role="switch"
              aria-checked={showBalances}
              aria-label="Show balances by default"
            >
              <span />
            </button>
          </div>
        </Card>

        {/* ---- keys (info) ---- */}
        <Card>
          <div className="clab">KEYS & RECOVERY</div>
          <ComplianceList
            items={[
              { label: "Seed phrase", value: "self-custody · BIP39", level: "ok" },
              { label: "Viewing key", value: "read-only · shareable" },
              { label: "Note cache", value: "encrypted · local" },
              { label: "Vault", value: "password-encrypted on this device", level: "ok" },
            ]}
          />
        </Card>

        {/* ---- infrastructure (info) ---- */}
        <Card>
          <div className="clab">INFRASTRUCTURE</div>
          <ComplianceList
            items={[
              { label: "Backend", value: `${backend.label} · ${backend.meta}`, level: "ok" },
              { label: "Relayer", value: "broadcast-only (gas sponsored)", level: "ok" },
              { label: "Indexer", value: "view-tags" },
              { label: "Funding account", value: dfxLinked ? "linked" : "not linked", level: dfxLinked ? "ok" : "pending" },
            ]}
          />
        </Card>

        {/* ---- security actions ---- */}
        <Card style={{ gridColumn: "1 / -1" }}>
          <div className="clab">SECURITY</div>
          <p className="sub" style={{ marginTop: 10 }}>
            Your keys never leave this device. Signing out removes the encrypted vault here — restore
            anytime on any device with your seed phrase.
          </p>
          <div className="actions">
            <Button onClick={signOut}>Sign out · use a different seed</Button>
          </div>
        </Card>
      </div>
    </section>
  );
}
