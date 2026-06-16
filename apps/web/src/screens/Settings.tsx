import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, ComplianceList, Field, ScreenHead } from "../components/primitives";
import { useApi } from "../lib/ApiProvider";
import { useSession } from "../lib/SessionProvider";
import { getActiveBackendId, getBackendConfig } from "../lib/backends";
import { clearVault } from "../lib/vault";
import { toast, confirmDialog } from "../lib/overlays";
import { getApprovalThreshold, setApprovalThreshold } from "../lib/prefs";

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
  const [showBalances, setShowBalances] = useState(() => {
    try { return localStorage.getItem(SHOW_BAL_KEY) === "1"; } catch { return false; }
  });
  const [threshold, setThreshold] = useState(() => getApprovalThreshold());

  function changeThreshold(v: string) {
    const n = Number(v) || 0;
    setThreshold(n);
    setApprovalThreshold(n);
  }

  async function save() {
    setSaving(true);
    try {
      setSession(await api.updateProfile({ name, email }));
      toast("Profile saved", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save", "error");
    } finally {
      setSaving(false);
    }
  }

  function toggleShowBalances() {
    const v = !showBalances;
    setShowBalances(v);
    try { localStorage.setItem(SHOW_BAL_KEY, v ? "1" : "0"); } catch { /* ignore */ }
  }

  async function signOut() {
    const ok = await confirmDialog({
      title: "Sign out of this device?",
      body: "This removes the encrypted vault stored here. You can restore on any device with your seed phrase.",
      confirmLabel: "Sign out",
      danger: true,
    });
    if (ok) {
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
          <div className="actions">
            <Button variant="solid" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
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
          <div className="set-row">
            <div>
              <div className="set-t">Approval threshold (USDC)</div>
              <div className="set-s">Payments at or above this amount need a second approver (four-eyes).</div>
            </div>
            <input
              className="input"
              style={{ width: 130, flex: "0 0 auto" }}
              type="number"
              min={0}
              step={1000}
              value={threshold}
              onChange={(e) => changeThreshold(e.target.value)}
              aria-label="Approval threshold in USDC"
            />
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
