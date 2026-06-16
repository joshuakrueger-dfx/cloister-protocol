import { useMemo, useState } from "react";
import type { Disbursement } from "../lib/types";
import { Tag } from "./primitives";
import { useT } from "../lib/i18n";
import { codingLabel } from "../lib/masterdata";
import { parseAmount } from "../lib/accountingExport";

function statusTag(status: Disbursement["status"], tr: (en: string, de: string) => string) {
  if (status === "proving" || status === "pending") return <Tag level="pending">{tr("proving", "läuft")}</Tag>;
  if (status === "failed") return <Tag level="bad">{tr("failed", "fehlgeschlagen")}</Tag>;
  return <Tag level="ok">{tr("settled", "abgewickelt")}</Tag>;
}

type SortKey = "date" | "recipient" | "amount" | "chain" | "status";
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
// "Jun 16" → sortable number (month*100+day); ISO dates handled too.
function dateRank(d: string): number {
  const iso = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return Number(iso[1]) * 10000 + Number(iso[2]) * 100 + Number(iso[3]);
  const m = d.match(/^([A-Za-z]{3})\s+(\d{1,2})$/);
  if (m) return (MONTHS.indexOf(m[1].toLowerCase()) + 1) * 100 + Number(m[2]);
  return 0;
}

const PAGE_SIZE = 20;

// Loading-/Empty-/Error-States werden vom Aufrufer gerendert (state-Zeile);
// hier nur die reine Datentabelle. powerTable schaltet Sortierung, Summenzeile
// und Pagination zu (für die Activity-Ansicht).
export function DisbursementTable({
  rows,
  withDate = false,
  withCoding = false,
  powerTable = false,
  loading = false,
  error = null,
}: {
  rows: Disbursement[];
  withDate?: boolean;
  withCoding?: boolean;
  powerTable?: boolean;
  loading?: boolean;
  error?: string | null;
}) {
  const tr = useT();
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<1 | -1>(-1); // newest first by default
  const [page, setPage] = useState(0);

  const showCoding = withCoding && rows.some((r) => r.accounting && Object.keys(r.accounting).length > 0);

  const sorted = useMemo(() => {
    if (!powerTable) return rows;
    const arr = [...rows];
    arr.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "amount") cmp = parseAmount(a.amount).value - parseAmount(b.amount).value;
      else if (sortKey === "date") cmp = dateRank(a.date) - dateRank(b.date);
      else cmp = String(a[sortKey]).localeCompare(String(b[sortKey]));
      return cmp * sortDir;
    });
    return arr;
  }, [rows, powerTable, sortKey, sortDir]);

  const pageCount = powerTable ? Math.max(1, Math.ceil(sorted.length / PAGE_SIZE)) : 1;
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = powerTable ? sorted.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE) : sorted;

  // Totals across ALL rows (not just the page), grouped by currency.
  const totals = useMemo(() => {
    const by: Record<string, number> = {};
    rows.forEach((r) => {
      const { value, currency } = parseAmount(r.amount);
      by[currency] = (by[currency] || 0) + value;
    });
    return Object.entries(by)
      .map(([cur, v]) => `${v.toLocaleString("en-US")} ${cur}`)
      .join(" · ");
  }, [rows]);

  function sortBy(k: SortKey) {
    if (!powerTable) return;
    if (k === sortKey) setSortDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(k);
      setSortDir(k === "amount" || k === "date" ? -1 : 1);
    }
    setPage(0);
  }
  const arrow = (k: SortKey) => (powerTable && sortKey === k ? (sortDir === 1 ? " ↑" : " ↓") : "");
  const Th = ({ k, children }: { k: SortKey; children: React.ReactNode }) =>
    powerTable ? (
      <th className="sortable" onClick={() => sortBy(k)} role="button" tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && sortBy(k)}>
        {children}{arrow(k)}
      </th>
    ) : (
      <th>{children}</th>
    );

  const baseCols = (withDate ? 5 : 4) + (showCoding ? 1 : 0) + 2; // recipient..status
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {withDate ? <Th k="date">{tr("Date", "Datum")}</Th> : null}
            <Th k="recipient">{tr("Recipient", "Empfänger")}</Th>
            <th>{tr("Purpose", "Zweck")}</th>
            <Th k="amount">{tr("Amount", "Betrag")}</Th>
            <Th k="chain">{tr("Chain", "Chain")}</Th>
            {showCoding ? <th>{tr("Coding", "Kontierung")}</th> : null}
            <th>{tr("Compliance", "Compliance")}</th>
            <Th k="status">{tr("Status", "Status")}</Th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr className="loading-row"><td colSpan={baseCols}>{tr("Loading…", "Lädt…")}</td></tr>
          ) : error ? (
            <tr className="error-row"><td colSpan={baseCols}>{error}</td></tr>
          ) : rows.length === 0 ? (
            <tr className="loading-row"><td colSpan={baseCols}>{tr("No disbursements yet.", "Noch keine Auszahlungen.")}</td></tr>
          ) : (
            pageRows.map((t) => (
              <tr key={t.id}>
                {withDate ? <td>{t.date}</td> : null}
                <td className="addr">{t.recipient}</td>
                <td>{t.purpose}</td>
                <td className="addr">{t.amount}</td>
                <td>{t.chain}</td>
                {showCoding ? <td className="mono" style={{ fontSize: 12 }}>{codingLabel(t.accounting)}</td> : null}
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
        {powerTable && rows.length > 0 ? (
          <tfoot>
            <tr className="totals-row">
              {withDate ? <td /> : null}
              <td className="addr"><b>{tr("Total", "Summe")}</b></td>
              <td>{tr(`${rows.length} payments`, `${rows.length} Zahlungen`)}</td>
              <td className="addr"><b>{totals}</b></td>
              <td colSpan={(showCoding ? 1 : 0) + 3} />
            </tr>
          </tfoot>
        ) : null}
      </table>
      {powerTable && pageCount > 1 ? (
        <div className="table-pager">
          <button className="reveal-btn" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0}>← {tr("Prev", "Zurück")}</button>
          <span className="pager-info">{tr(`Page ${safePage + 1} of ${pageCount}`, `Seite ${safePage + 1} von ${pageCount}`)}</span>
          <button className="reveal-btn" onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={safePage >= pageCount - 1}>{tr("Next", "Weiter")} →</button>
        </div>
      ) : null}
    </div>
  );
}
