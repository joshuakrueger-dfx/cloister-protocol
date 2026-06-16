import { useState } from "react";
import { useApi } from "../lib/ApiProvider";
import { useAsync } from "../lib/useAsync";
import { Button, Card, Field, ScreenHead, SanctionsTag } from "../components/primitives";
import { toast } from "../lib/overlays";
import { useT } from "../lib/i18n";

export function Recipients() {
  const api = useApi();
  const tr = useT();
  const { data, loading, error, reload } = useAsync(() => api.getRecipients(), []);

  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState("");
  const [type, setType] = useState("B2B vendor");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [favBusy, setFavBusy] = useState<string | null>(null);

  // favourites float to the top, otherwise keep insertion order
  const rows = [...(data ?? [])].sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite));

  async function toggleFav(id: string) {
    setFavBusy(id);
    try {
      await api.toggleRecipientFavorite(id);
      reload();
    } finally {
      setFavBusy(null);
    }
  }

  async function add() {
    if (!label.trim() || !address.trim()) return;
    setBusy(true);
    try {
      await api.addRecipient({ label: label.trim(), type, address: address.trim() });
      setLabel("");
      setAddress("");
      setShowForm(false);
      reload();
      toast(tr("Recipient added", "Empfänger hinzugefügt"), "success");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="view">
      <ScreenHead
        eyebrow={tr("COUNTERPARTIES", "GEGENPARTEIEN")}
        title={tr("Recipients", "Empfänger")}
        sub={tr(
          "Labels are encrypted with your viewing key and live only in your account. On-chain, the counterparty never appears.",
          "Labels werden mit deinem Viewing-Key verschlüsselt und existieren nur in deinem Konto. On-chain erscheint die Gegenpartei nie.",
        )}
      />

      <div className="actions" style={{ marginTop: 18 }}>
        <Button sm onClick={() => setShowForm((s) => !s)}>{showForm ? tr("Close", "Schließen") : tr("+ Add recipient", "+ Empfänger hinzufügen")}</Button>
      </div>

      {showForm ? (
        <Card style={{ marginTop: 14 }}>
          <div className="grid g3">
            <Field label={tr("LABEL (encrypted)", "LABEL (verschlüsselt)")} style={{ marginTop: 0 }}>
              <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={tr("e.g. Acme GmbH", "z. B. Acme GmbH")} />
            </Field>
            <Field label={tr("TYPE", "TYP")} style={{ marginTop: 0 }}>
              <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
                <option value="B2B vendor">{tr("B2B vendor", "B2B-Lieferant")}</option>
                <option value="Contributor">{tr("Contributor", "Mitwirkender")}</option>
                <option value="PSP / broker">{tr("PSP / broker", "PSP / Broker")}</option>
                <option value="Programmatic">{tr("Programmatic", "Programmatisch")}</option>
              </select>
            </Field>
            <Field label={tr("ADDRESS", "ADRESSE")} style={{ marginTop: 0 }}>
              <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="0x…" />
            </Field>
          </div>
          <div className="actions">
            <Button variant="solid" arrow onClick={add} disabled={busy || !label.trim() || !address.trim()}>
              {busy ? tr("Adding…", "Füge hinzu…") : tr("Add recipient", "Empfänger hinzufügen")}
            </Button>
          </div>
        </Card>
      ) : null}

      <Card style={{ marginTop: 16, padding: "18px 0 0" }}>
        <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th>{tr("Label (encrypted)", "Label (verschlüsselt)")}</th>
              <th>{tr("Type", "Typ")}</th>
              <th>{tr("Address", "Adresse")}</th>
              <th>{tr("Last paid", "Zuletzt gezahlt")}</th>
              <th>{tr("Sanctions", "Sanktionen")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr className="loading-row">
                <td colSpan={6}>{tr("Loading…", "Lädt…")}</td>
              </tr>
            ) : error ? (
              <tr className="error-row">
                <td colSpan={6}>{error}</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr className="loading-row">
                <td colSpan={6}>{tr("No recipients yet.", "Noch keine Empfänger.")}</td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ paddingRight: 0 }}>
                    <button
                      className={`star-btn${r.favorite ? " on" : ""}`}
                      onClick={() => toggleFav(r.id)}
                      disabled={favBusy === r.id}
                      title={r.favorite ? tr("Remove from favourites", "Aus Favoriten entfernen") : tr("Add to favourites", "Zu Favoriten")}
                      aria-label={r.favorite ? tr("Remove from favourites", "Aus Favoriten entfernen") : tr("Add to favourites", "Zu Favoriten")}
                    >
                      {r.favorite ? "★" : "☆"}
                    </button>
                  </td>
                  <td className="addr">{r.label}</td>
                  <td>{r.type}</td>
                  <td className="mono">{r.address}</td>
                  <td>{r.lastPaid}</td>
                  <td>
                    <SanctionsTag level={r.sanctions} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </Card>
    </section>
  );
}
