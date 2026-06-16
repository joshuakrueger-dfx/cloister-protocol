import type { Disbursement } from "../lib/types";
import { Tag } from "./primitives";
import { useT } from "../lib/i18n";

function statusTag(status: Disbursement["status"], tr: (en: string, de: string) => string) {
  if (status === "proving" || status === "pending") return <Tag level="pending">{tr("proving", "läuft")}</Tag>;
  if (status === "failed") return <Tag level="bad">{tr("failed", "fehlgeschlagen")}</Tag>;
  return <Tag level="ok">{tr("settled", "abgewickelt")}</Tag>;
}

// Loading-/Empty-/Error-States werden vom Aufrufer gerendert (state-Zeile);
// hier nur die reine Datentabelle.
export function DisbursementTable({
  rows,
  withDate = false,
  loading = false,
  error = null,
}: {
  rows: Disbursement[];
  withDate?: boolean;
  loading?: boolean;
  error?: string | null;
}) {
  const tr = useT();
  const cols = withDate ? 7 : 6;
  return (
    <div className="table-scroll">
    <table>
      <thead>
        <tr>
          {withDate ? <th>{tr("Date", "Datum")}</th> : null}
          <th>{tr("Recipient", "Empfänger")}</th>
          <th>{tr("Purpose", "Zweck")}</th>
          <th>{tr("Amount", "Betrag")}</th>
          <th>{tr("Chain", "Chain")}</th>
          <th>{tr("Compliance", "Compliance")}</th>
          <th>{tr("Status", "Status")}</th>
        </tr>
      </thead>
      <tbody>
        {loading ? (
          <tr className="loading-row">
            <td colSpan={cols}>{tr("Loading…", "Lädt…")}</td>
          </tr>
        ) : error ? (
          <tr className="error-row">
            <td colSpan={cols}>{error}</td>
          </tr>
        ) : rows.length === 0 ? (
          <tr className="loading-row">
            <td colSpan={cols}>{tr("No disbursements yet.", "Noch keine Auszahlungen.")}</td>
          </tr>
        ) : (
          rows.map((t) => (
            <tr key={t.id}>
              {withDate ? <td>{t.date}</td> : null}
              <td className="addr">{t.recipient}</td>
              <td>{t.purpose}</td>
              <td className="addr">{t.amount}</td>
              <td>{t.chain}</td>
              <td>
                {t.compliance === "flagged" ? (
                  <Tag level="bad">{tr("flagged", "markiert")}</Tag>
                ) : (
                  <Tag level="ok">{tr("clean", "sauber")}</Tag>
                )}
              </td>
              <td>{statusTag(t.status, tr)}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
    </div>
  );
}
