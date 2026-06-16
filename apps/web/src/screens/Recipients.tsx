import { useState } from "react";
import { useApi } from "../lib/ApiProvider";
import { useAsync } from "../lib/useAsync";
import { Button, Card, Field, ScreenHead, SanctionsTag } from "../components/primitives";
import { toast } from "../lib/overlays";

export function Recipients() {
  const api = useApi();
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
      toast("Recipient added", "success");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="view">
      <ScreenHead
        eyebrow="COUNTERPARTIES"
        title="Recipients"
        sub="Labels are encrypted with your viewing key and live only in your account. On-chain, the counterparty never appears."
      />

      <div className="actions" style={{ marginTop: 18 }}>
        <Button sm onClick={() => setShowForm((s) => !s)}>{showForm ? "Close" : "+ Add recipient"}</Button>
      </div>

      {showForm ? (
        <Card style={{ marginTop: 14 }}>
          <div className="grid g3">
            <Field label="LABEL (encrypted)" style={{ marginTop: 0 }}>
              <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Acme GmbH" />
            </Field>
            <Field label="TYPE" style={{ marginTop: 0 }}>
              <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
                <option>B2B vendor</option>
                <option>Contributor</option>
                <option>PSP / broker</option>
                <option>Programmatic</option>
              </select>
            </Field>
            <Field label="ADDRESS" style={{ marginTop: 0 }}>
              <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="0x…" />
            </Field>
          </div>
          <div className="actions">
            <Button variant="solid" arrow onClick={add} disabled={busy || !label.trim() || !address.trim()}>
              {busy ? "Adding…" : "Add recipient"}
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
              <th>Label (encrypted)</th>
              <th>Type</th>
              <th>Address</th>
              <th>Last paid</th>
              <th>Sanctions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr className="loading-row">
                <td colSpan={6}>Loading…</td>
              </tr>
            ) : error ? (
              <tr className="error-row">
                <td colSpan={6}>{error}</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr className="loading-row">
                <td colSpan={6}>No recipients yet.</td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ paddingRight: 0 }}>
                    <button
                      className={`star-btn${r.favorite ? " on" : ""}`}
                      onClick={() => toggleFav(r.id)}
                      disabled={favBusy === r.id}
                      title={r.favorite ? "Remove from favourites" : "Add to favourites"}
                      aria-label={r.favorite ? "Remove from favourites" : "Add to favourites"}
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
