import { useState } from "react";
import { Button, Card, Field, ScreenHead } from "../components/primitives";
import { toast, confirmDialog } from "../lib/overlays";
import { useT } from "../lib/i18n";
import { getMd, addMd, removeMd } from "../lib/masterdata";
import type { MdKind, MdItem } from "../lib/masterdata";

// One editable master-data list (cost centers, GL accounts, projects, tax codes).
// Add a code+name row, remove an existing one. Feeds the Kontierung suggestions
// and the accounting export mapping.
function MdList({ kind, title, codeLabel, nameLabel }: { kind: MdKind; title: string; codeLabel: string; nameLabel: string }) {
  const tr = useT();
  const [items, setItems] = useState<MdItem[]>(() => getMd(kind));
  const [code, setCode] = useState("");
  const [name, setName] = useState("");

  function add() {
    const c = code.trim();
    if (!c) return;
    setItems(addMd(kind, { code: c, name: name.trim() }));
    setCode("");
    setName("");
    toast(tr("Saved", "Gespeichert"), "success");
  }
  async function remove(c: string) {
    const ok = await confirmDialog({
      title: tr("Remove this entry?", "Diesen Eintrag entfernen?"),
      body: tr("It stays on payments already coded with it.", "Bei bereits damit kontierten Zahlungen bleibt er erhalten."),
      confirmLabel: tr("Remove", "Entfernen"),
      danger: true,
    });
    if (ok) setItems(removeMd(kind, c));
  }

  return (
    <Card>
      <div className="clab">{title}</div>
      <div className="table-scroll" style={{ marginTop: 8 }}>
        <table>
          <thead>
            <tr>
              <th style={{ width: 120 }}>{codeLabel}</th>
              <th>{nameLabel}</th>
              <th style={{ width: 60 }} />
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr className="loading-row"><td colSpan={3}>{tr("No entries yet.", "Noch keine Einträge.")}</td></tr>
            ) : (
              items.map((i) => (
                <tr key={i.code}>
                  <td className="addr mono">{i.code}</td>
                  <td>{i.name || "—"}</td>
                  <td style={{ textAlign: "right" }}>
                    <button className="reveal-btn" onClick={() => remove(i.code)}>{tr("remove", "entfernen")}</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="grid g2" style={{ marginTop: 8 }}>
        <Field label={codeLabel}>
          <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder={tr("e.g. 2000", "z. B. 2000")} onKeyDown={(e) => e.key === "Enter" && add()} />
        </Field>
        <Field label={nameLabel}>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={tr("e.g. Sales", "z. B. Vertrieb")} onKeyDown={(e) => e.key === "Enter" && add()} />
        </Field>
      </div>
      <div className="actions">
        <Button sm variant="solid" onClick={add} disabled={!code.trim()}>{tr("Add", "Hinzufügen")}</Button>
      </div>
    </Card>
  );
}

export function Stammdaten() {
  const tr = useT();
  return (
    <section className="view">
      <ScreenHead
        eyebrow={tr("MASTER DATA", "STAMMDATEN")}
        title={tr("Master data", "Stammdaten")}
        sub={tr(
          "The chart of cost centers, GL accounts, projects and tax codes your team books against. These drive the coding suggestions on Disburse and the DATEV / SAP export mapping.",
          "Der Stamm an Kostenstellen, Sachkonten, Projekten und Steuerschlüsseln, gegen die dein Team bucht. Sie steuern die Kontierungs-Vorschläge beim Auszahlen und die DATEV-/SAP-Export-Zuordnung.",
        )}
      />
      <div className="grid g2" style={{ marginTop: 24 }}>
        <MdList kind="costCenters" title={tr("COST CENTERS", "KOSTENSTELLEN")} codeLabel={tr("CODE", "NUMMER")} nameLabel={tr("NAME", "BEZEICHNUNG")} />
        <MdList kind="glAccounts" title={tr("GL ACCOUNTS", "SACHKONTEN")} codeLabel={tr("ACCOUNT", "KONTO")} nameLabel={tr("NAME", "BEZEICHNUNG")} />
        <MdList kind="projects" title={tr("PROJECTS / ORDERS", "PROJEKTE / INNENAUFTRÄGE")} codeLabel={tr("CODE", "NUMMER")} nameLabel={tr("NAME", "BEZEICHNUNG")} />
        <MdList kind="taxCodes" title={tr("TAX CODES", "STEUERSCHLÜSSEL")} codeLabel={tr("KEY", "SCHLÜSSEL")} nameLabel={tr("NAME", "BEZEICHNUNG")} />
      </div>
    </section>
  );
}
