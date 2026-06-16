import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../lib/ApiProvider";
import { useAsync } from "../lib/useAsync";
import { Button, Card, ScreenHead } from "../components/primitives";
import { DisbursementTable } from "../components/DisbursementTable";
import { toast } from "../lib/overlays";
import { useT } from "../lib/i18n";
import { useSession } from "../lib/SessionProvider";
import { exportDatev, exportAccountingCsv, exportSepaXml } from "../lib/accountingExport";
import type { ExportFormat } from "../lib/types";

type AcctFmt = "datev" | "csv" | "sepa";

export function Activity() {
  const api = useApi();
  const nav = useNavigate();
  const tr = useT();
  const { session } = useSession();
  const { data, loading, error } = useAsync(() => api.getActivity(), []);
  const [showFilter, setShowFilter] = useState(false);
  const [query, setQuery] = useState("");
  const [exporting, setExporting] = useState(false);
  const [stmtPeriod, setStmtPeriod] = useState("Q2 2026");
  const [stmtFmt, setStmtFmt] = useState<ExportFormat>("pdf");
  const [stmtBusy, setStmtBusy] = useState(false);
  const [acctFmt, setAcctFmt] = useState<AcctFmt>("datev");

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
      toast(tr("Audit log exported · CSV", "Audit-Log exportiert · CSV"), "success");
    } finally {
      setExporting(false);
    }
  }

  async function exportStatement() {
    setStmtBusy(true);
    try {
      await api.exportStatement(stmtPeriod, stmtFmt);
      toast(tr(`Statement downloaded · ${stmtFmt.toUpperCase()}`, `Auszug heruntergeladen · ${stmtFmt.toUpperCase()}`), "success");
    } finally {
      setStmtBusy(false);
    }
  }

  function exportAccounting() {
    const list = rows.length ? rows : (data ?? []);
    if (!list.length) return;
    if (acctFmt === "datev") {
      exportDatev(list, stmtPeriod);
      toast(tr("Booking batch exported · DATEV", "Buchungsstapel exportiert · DATEV"), "success");
    } else if (acctFmt === "csv") {
      exportAccountingCsv(list, stmtPeriod);
      toast(tr("Accounting export · CSV", "Buchhaltungs-Export · CSV"), "success");
    } else {
      const msgId = `CLOISTER-${stmtPeriod.replace(/[^A-Za-z0-9]/g, "")}-${session?.email?.split("@")[0] ?? "tx"}`;
      const { included, skipped } = exportSepaXml(list, {
        debtorName: session?.org.name || "Cloister account",
        msgId,
        createdAt: new Date().toISOString(),
      }, stmtPeriod);
      if (included === 0) {
        toast(tr("No EUR payments to include in the SEPA file.", "Keine EUR-Zahlungen für die SEPA-Datei vorhanden."), "error");
      } else {
        toast(
          tr(`SEPA file exported · ${included} payment(s)${skipped ? `, ${skipped} non-EUR skipped` : ""}`,
             `SEPA-Datei exportiert · ${included} Zahlung(en)${skipped ? `, ${skipped} Nicht-EUR übersprungen` : ""}`),
          "success",
        );
      }
    }
  }

  return (
    <section className="view">
      <ScreenHead
        eyebrow={tr("YOUR LEDGER", "DEIN HAUPTBUCH")}
        title={tr("Activity", "Aktivität")}
        sub={tr(
          "Decrypted with your viewing key — visible only to you. Read-only. Export for accounting or selective disclosure.",
          "Mit deinem Viewing-Key entschlüsselt — nur für dich sichtbar. Schreibgeschützt. Export für Buchhaltung oder selektive Offenlegung.",
        )}
      />
      <div className="actions" style={{ marginTop: 18 }}>
        <Button sm onClick={() => setShowFilter((f) => !f)}>{showFilter ? tr("Hide filter", "Filter ausblenden") : tr("Filter", "Filter")}</Button>
        <Button sm onClick={exportCsv} disabled={exporting || (data?.length ?? 0) === 0}>
          {exporting ? tr("Exporting…", "Exportiere…") : tr("Export CSV", "CSV exportieren")}
        </Button>
        <Button sm onClick={() => nav("/compliance")}>
          {tr("Generate receipt", "Beleg erzeugen")}
        </Button>
      </div>
      <div className="actions" style={{ marginTop: 10, alignItems: "center", gap: 10 }}>
        <span className="clab" style={{ marginRight: 2 }}>{tr("ACCOUNT STATEMENT", "KONTOAUSZUG")}</span>
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
          {stmtBusy ? tr("Generating…", "Erstelle…") : tr("Download statement", "Auszug herunterladen")}
        </Button>
      </div>
      <div className="actions" style={{ marginTop: 10, alignItems: "center", gap: 10 }}>
        <span className="clab" style={{ marginRight: 2 }}>{tr("ACCOUNTING EXPORT", "BUCHHALTUNGS-EXPORT")}</span>
        <select className="input" style={{ width: "auto" }} value={acctFmt} onChange={(e) => setAcctFmt(e.target.value as AcctFmt)} aria-label={tr("Accounting format", "Buchhaltungs-Format")}>
          <option value="datev">{tr("DATEV (booking batch)", "DATEV (Buchungsstapel)")}</option>
          <option value="csv">{tr("CSV (SAP / generic)", "CSV (SAP / generisch)")}</option>
          <option value="sepa">{tr("SEPA pain.001 (XML)", "SEPA pain.001 (XML)")}</option>
        </select>
        <Button sm arrow onClick={exportAccounting} disabled={(data?.length ?? 0) === 0}>
          {tr("Export for accounting", "Für Buchhaltung exportieren")}
        </Button>
      </div>
      {showFilter ? (
        <input
          className="input"
          style={{ marginTop: 14, maxWidth: 360 }}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={tr("Filter by recipient, purpose, chain, status…", "Nach Empfänger, Zweck, Chain, Status filtern…")}
          autoFocus
        />
      ) : null}
      <Card style={{ marginTop: 20, padding: "18px 0 0" }}>
        <DisbursementTable rows={rows} withDate withCoding powerTable loading={loading} error={error} />
      </Card>
    </section>
  );
}
