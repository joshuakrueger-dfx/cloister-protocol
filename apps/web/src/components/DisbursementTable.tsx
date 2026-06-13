import type { Disbursement } from "../lib/types";
import { Tag } from "./primitives";

function statusTag(status: Disbursement["status"]) {
  if (status === "proving" || status === "pending")
    return <Tag level="pending">proving</Tag>;
  if (status === "failed") return <Tag level="bad">failed</Tag>;
  return <Tag level="ok">settled</Tag>;
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
  const cols = withDate ? 7 : 6;
  return (
    <table>
      <thead>
        <tr>
          {withDate ? <th>Date</th> : null}
          <th>Recipient</th>
          <th>Purpose</th>
          <th>Amount</th>
          <th>Chain</th>
          <th>Compliance</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {loading ? (
          <tr className="loading-row">
            <td colSpan={cols}>Loading…</td>
          </tr>
        ) : error ? (
          <tr className="error-row">
            <td colSpan={cols}>{error}</td>
          </tr>
        ) : rows.length === 0 ? (
          <tr className="loading-row">
            <td colSpan={cols}>No disbursements yet.</td>
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
                <Tag level="ok">clean</Tag>
              </td>
              <td>{statusTag(t.status)}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
