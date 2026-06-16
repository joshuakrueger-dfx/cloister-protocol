import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../lib/ApiProvider";
import { useAsync } from "../lib/useAsync";
import { Button, Card, ScreenHead } from "../components/primitives";
import { DisbursementTable } from "../components/DisbursementTable";
import type { ExportFormat } from "../lib/types";

export function Activity() {
  const api = useApi();
  const nav = useNavigate();
  const { data, loading, error } = useAsync(() => api.getActivity(), []);
  const [showFilter, setShowFilter] = useState(false);
  const [query, setQuery] = useState("");
  const [exporting, setExporting] = useState(false);
  const [stmtPeriod, setStmtPeriod] = useState("Q2 2026");
  const [stmtFmt, setStmtFmt] = useState<ExportFormat>("pdf");
  const [stmtBusy, setStmtBusy] = useState(false);

  const rows = useMemo(() => {
    const all = data ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((d) =>
      [d.recipient, d.purpose, d.amount, d.chain, d.status].some((v) => v.toLowerCase().includes(q)),
    );
  }, [data, query]);

  async function exportCsv() {
    setExporting(true);
    try {
      await api.exportAuditLog("csv");
    } finally {
      setExporting(false);
    }
  }

  async function exportStatement() {
    setStmtBusy(true);
    try {
      await api.exportStatement(stmtPeriod, stmtFmt);
    } finally {
      setStmtBusy(false);
    }
  }

  return (
    <section className="view">
      <ScreenHead
        eyebrow="YOUR LEDGER"
        title="Activity"
        sub="Decrypted with your viewing key — visible only to you. Read-only. Export for accounting or selective disclosure."
      />
      <div className="actions" style={{ marginTop: 18 }}>
        <Button sm onClick={() => setShowFilter((f) => !f)}>{showFilter ? "Hide filter" : "Filter"}</Button>
        <Button sm onClick={exportCsv} disabled={exporting || (data?.length ?? 0) === 0}>
          {exporting ? "Exporting…" : "Export CSV"}
        </Button>
        <Button sm onClick={() => nav("/compliance")}>
          Generate receipt
        </Button>
      </div>
      <div className="actions" style={{ marginTop: 10, alignItems: "center", gap: 10 }}>
        <span className="clab" style={{ marginRight: 2 }}>ACCOUNT STATEMENT</span>
        <select className="input" style={{ width: "auto" }} value={stmtPeriod} onChange={(e) => setStmtPeriod(e.target.value)}>
          <option>Q2 2026</option>
          <option>Jun 2026</option>
          <option>2026 YTD</option>
        </select>
        <select className="input" style={{ width: "auto" }} value={stmtFmt} onChange={(e) => setStmtFmt(e.target.value as ExportFormat)}>
          <option value="pdf">PDF</option>
          <option value="csv">CSV (Excel / Sheets)</option>
          <option value="json">JSON</option>
        </select>
        <Button sm variant="solid" arrow onClick={exportStatement} disabled={stmtBusy}>
          {stmtBusy ? "Generating…" : "Download statement"}
        </Button>
      </div>
      {showFilter ? (
        <input
          className="input"
          style={{ marginTop: 14, maxWidth: 360 }}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by recipient, purpose, chain, status…"
          autoFocus
        />
      ) : null}
      <Card style={{ marginTop: 20, padding: "18px 0 0" }}>
        <DisbursementTable rows={rows} withDate loading={loading} error={error} />
      </Card>
    </section>
  );
}
