import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, ComplianceList, Field, ScreenHead } from "../components/primitives";
import { useApi } from "../lib/ApiProvider";
import { useSession } from "../lib/SessionProvider";
import { getActiveBackendId, getBackendConfig } from "../lib/backends";
import { clearVault } from "../lib/vault";
import { toast, confirmDialog } from "../lib/overlays";
import { getApprovalThreshold, setApprovalThreshold, getApprovalThreshold2, setApprovalThreshold2, getRequireApproval, setRequireApproval } from "../lib/prefs";
import { useT } from "../lib/i18n";
import { useTheme, setTheme } from "../lib/theme";

const SHOW_BAL_KEY = "cloister.showBalances";

export function Settings() {
  const api = useApi();
  const nav = useNavigate();
  const tr = useT();
  const { session, setSession } = useSession();
  const theme = useTheme();
  const backend = getBackendConfig(getActiveBackendId());
  const dfxLinked = session?.dfxLinked ?? false;

  const [name, setName] = useState(session?.org.name ?? "");
  const [email, setEmail] = useState(session?.email ?? "");
  const [saving, setSaving] = useState(false);
  const [showBalances, setShowBalances] = useState(() => {
    try { return localStorage.getItem(SHOW_BAL_KEY) === "1"; } catch { return false; }
  });
  const [threshold, setThreshold] = useState(() => getApprovalThreshold());
  const [threshold2, setThreshold2] = useState(() => getApprovalThreshold2());
  const [requireApproval, setRequire] = useState(() => getRequireApproval());

  function changeThreshold(v: string) {
    const n = Number(v) || 0;
    setThreshold(n);
    setApprovalThreshold(n);
  }
  function changeThreshold2(v: string) {
    const n = Number(v) || 0;
    setThreshold2(n);
    setApprovalThreshold2(n);
  }
  function toggleRequire() {
    const v = !requireApproval;
    setRequire(v);
    setRequireApproval(v);
  }

  async function save() {
    setSaving(true);
    try {
      setSession(await api.updateProfile({ name, email }));
      toast(tr("Profile saved", "Profil gespeichert"), "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : tr("Could not save", "Konnte nicht speichern"), "error");
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
      title: tr("Sign out of this device?", "Von diesem Gerät abmelden?"),
      body: tr(
        "This removes the encrypted vault stored here. You can restore on any device with your seed phrase.",
        "Das entfernt den hier gespeicherten verschlüsselten Vault. Du kannst ihn auf jedem Gerät mit deiner Seed-Phrase wiederherstellen.",
      ),
      confirmLabel: tr("Sign out", "Abmelden"),
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
        eyebrow={tr("ACCOUNT", "KONTO")}
        title={tr("Settings", "Einstellungen")}
        sub={tr(
          "Self-custody. Your spend / view / nullifier keys derive from one seed and never leave the device. Notes are recoverable from chain history via the viewing key.",
          "Selbstverwahrend. Deine Spend-/View-/Nullifier-Schlüssel leiten sich aus einer Seed ab und verlassen das Gerät nie. Notes sind über den Viewing-Key aus der Chain-Historie wiederherstellbar.",
        )}
      />
      <div className="grid g2" style={{ marginTop: 24 }}>
        {/* ---- editable profile ---- */}
        <Card>
          <div className="clab">{tr("PROFILE", "PROFIL")}</div>
          <Field label={tr("ACCOUNT NAME", "KONTONAME")}>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={tr("e.g. Acme GmbH", "z. B. Acme GmbH")} />
          </Field>
          <Field label={tr("CONTACT EMAIL", "KONTAKT-E-MAIL")}>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </Field>
          <div className="actions">
            <Button variant="solid" onClick={save} disabled={saving}>{saving ? tr("Saving…", "Speichere…") : tr("Save changes", "Änderungen speichern")}</Button>
          </div>
        </Card>

        {/* ---- preferences ---- */}
        <Card>
          <div className="clab">{tr("PREFERENCES", "PRÄFERENZEN")}</div>
          <div className="set-row">
            <div>
              <div className="set-t">{tr("Appearance", "Erscheinungsbild")}</div>
              <div className="set-s">{tr("Light mode matches a familiar finance back-office look.", "Der helle Modus entspricht dem gewohnten Finanz-Backoffice-Look.")}</div>
            </div>
            <div className="seg" role="group" aria-label={tr("Appearance", "Erscheinungsbild")}>
              <button type="button" className={theme === "light" ? "on" : ""} onClick={() => setTheme("light")}>{tr("Light", "Hell")}</button>
              <button type="button" className={theme === "dark" ? "on" : ""} onClick={() => setTheme("dark")}>{tr("Dark", "Dunkel")}</button>
            </div>
          </div>
          <div className="set-row">
            <div>
              <div className="set-t">{tr("Show balances by default", "Salden standardmäßig anzeigen")}</div>
              <div className="set-s">{tr("When off, amounts stay masked until you tap “reveal”.", "Wenn aus, bleiben Beträge maskiert, bis du „zeigen“ tippst.")}</div>
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
              <div className="set-t">{tr("Require a second approver", "Zweit-Freigeber erforderlich")}</div>
              <div className="set-s">{tr("Four-eyes control: larger payments wait for a team member to approve before they're sent.", "Vier-Augen-Prinzip: Größere Zahlungen warten auf die Freigabe eines Team-Mitglieds, bevor sie gesendet werden.")}</div>
            </div>
            <button
              type="button"
              className={`toggle${requireApproval ? " on" : ""}`}
              onClick={toggleRequire}
              role="switch"
              aria-checked={requireApproval}
              aria-label="Require a second approver"
            >
              <span />
            </button>
          </div>
          {requireApproval ? (
            <div className="set-row">
              <div>
                <div className="set-t">{tr("Approval threshold (USDC)", "Freigabe-Schwelle (USDC)")}</div>
                <div className="set-s">{tr("Payments at or above this amount need the second approver. Smaller ones go straight through.", "Zahlungen ab diesem Betrag brauchen den Zweit-Freigeber. Kleinere gehen direkt durch.")}</div>
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
          ) : null}
          {requireApproval ? (
            <div className="set-row">
              <div>
                <div className="set-t">{tr("Two-approver threshold (USDC)", "Zwei-Freigeber-Schwelle (USDC)")}</div>
                <div className="set-s">{tr("Payments at or above this amount need two different approvers. Set to 0 to always require just one.", "Zahlungen ab diesem Betrag brauchen zwei verschiedene Freigeber. 0 = immer nur einer.")}</div>
              </div>
              <input
                className="input"
                style={{ width: 130, flex: "0 0 auto" }}
                type="number"
                min={0}
                step={5000}
                value={threshold2}
                onChange={(e) => changeThreshold2(e.target.value)}
                aria-label="Two-approver threshold in USDC"
              />
            </div>
          ) : null}
        </Card>

        {/* ---- keys (info) ---- */}
        <Card>
          <div className="clab">{tr("KEYS & RECOVERY", "SCHLÜSSEL & WIEDERHERSTELLUNG")}</div>
          <ComplianceList
            items={[
              { label: tr("Seed phrase", "Seed-Phrase"), value: tr("self-custody · BIP39", "selbstverwahrend · BIP39"), level: "ok" },
              { label: tr("Viewing key", "Viewing-Key"), value: tr("read-only · shareable", "nur lesen · teilbar") },
              { label: tr("Note cache", "Note-Cache"), value: tr("encrypted · local", "verschlüsselt · lokal") },
              { label: "Vault", value: tr("password-encrypted on this device", "passwortverschlüsselt auf diesem Gerät"), level: "ok" },
            ]}
          />
        </Card>

        {/* ---- infrastructure (info) ---- */}
        <Card>
          <div className="clab">{tr("INFRASTRUCTURE", "INFRASTRUKTUR")}</div>
          <ComplianceList
            items={[
              { label: "Backend", value: `${backend.label} · ${backend.meta}`, level: "ok" },
              { label: "Relayer", value: tr("broadcast-only (gas sponsored)", "nur Broadcast (Gas gesponsert)"), level: "ok" },
              { label: "Indexer", value: "view-tags" },
              { label: tr("Funding account", "Funding-Konto"), value: dfxLinked ? tr("linked", "verbunden") : tr("not linked", "nicht verbunden"), level: dfxLinked ? "ok" : "pending" },
            ]}
          />
        </Card>

        {/* ---- security actions ---- */}
        <Card style={{ gridColumn: "1 / -1" }}>
          <div className="clab">{tr("SECURITY", "SICHERHEIT")}</div>
          <p className="sub" style={{ marginTop: 10 }}>
            {tr(
              "Your keys never leave this device. Signing out removes the encrypted vault here — restore anytime on any device with your seed phrase.",
              "Deine Schlüssel verlassen dieses Gerät nie. Abmelden entfernt den verschlüsselten Vault hier — jederzeit auf jedem Gerät mit deiner Seed-Phrase wiederherstellbar.",
            )}
          </p>
          <div className="actions">
            <Button onClick={signOut}>{tr("Sign out · use a different seed", "Abmelden · anderen Seed verwenden")}</Button>
          </div>
        </Card>
      </div>
    </section>
  );
}
