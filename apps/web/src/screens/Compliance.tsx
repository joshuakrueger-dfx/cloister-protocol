import { useState } from "react";
import { useApi } from "../lib/ApiProvider";
import { useSession } from "../lib/SessionProvider";
import { useAsync } from "../lib/useAsync";
import { Button, Card, ComplianceList, Field, ScreenHead } from "../components/primitives";
import { ProofConsole } from "../components/ProofConsole";
import { KycVerify } from "../components/KycVerify";
import { fundingRequiresKyc } from "../lib/backends";
import { toast } from "../lib/overlays";
import { useT } from "../lib/i18n";
import type { Disclosure, ExportFormat, ProofStep, ReceiptScope } from "../lib/types";

export function Compliance() {
  const { session } = useSession();
  const tr = useT();
  // Only real backends gate payouts on verification; Demo has no gate, so no prompt.
  const needsKyc = fundingRequiresKyc() && !!session && session.kyc.status !== "verified";
  return (
    <section className="view">
      <ScreenHead
        eyebrow={tr("THE DIFFERENTIATOR", "DER UNTERSCHIED")}
        title={tr("Compliance Center", "Compliance-Center")}
        sub={tr(
          "Privacy you can prove. Generate clean-origin attestations and grant scoped, time-limited disclosure to banks, auditors and tax authorities — without ever exposing your full history.",
          "Privatsphäre, die du beweisen kannst. Erzeuge Belege sauberer Herkunft und gib Banken, Prüfern und Finanzämtern eine begrenzte, zeitlich befristete Einsicht — ohne je deine volle Historie offenzulegen.",
        )}
      />
      {needsKyc ? (
        <Card style={{ marginTop: 26 }}>
          <div className="clab">{tr("VERIFY IDENTITY — UNLOCK PAYOUTS", "IDENTITÄT VERIFIZIEREN — AUSZAHLUNGEN FREISCHALTEN")}</div>
          <p className="sub" style={{ marginTop: 10 }}>
            {tr(
              "Complete identity verification with a regulated account to enable funding and private payouts. Connect an existing account or create one — your full history stays private; only your clean-origin status is recorded.",
              "Schließe die Identitätsprüfung mit einem regulierten Konto ab, um Einzahlung und private Auszahlungen freizuschalten. Verbinde ein bestehendes Konto oder lege eines an — deine volle Historie bleibt privat; nur dein Sauber-Herkunft-Status wird erfasst.",
            )}
          </p>
          <KycVerify />
        </Card>
      ) : null}
      <div className="split" style={{ marginTop: 26 }}>
        <div>
          <ReceiptCard />
          <DisclosureCard />
        </div>
        <div>
          <AspCard />
          <JurisdictionCard />
        </div>
      </div>
    </section>
  );
}

function ReceiptCard() {
  const api = useApi();
  const tr = useT();
  const [scope, setScope] = useState<ReceiptScope>("single");
  const [periodMode, setPeriodMode] = useState("Q2 2026");
  const [period, setPeriod] = useState("Q2 2026");
  const [format, setFormat] = useState<ExportFormat>("pdf");
  const [lines, setLines] = useState<ProofStep[]>([]);
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);

  async function generate() {
    setBusy(true);
    setStarted(true);
    setLines([{ progress: 0, html: tr("assembling proof of innocence…", "stelle Proof of Innocence zusammen…") }]);
    try {
      await api.generateReceipt({ scope, period, format }, (s) => setLines((p) => [...p, s]));
      toast(tr(`Receipt downloaded · ${format.toUpperCase()}`, `Beleg heruntergeladen · ${format.toUpperCase()}`), "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : tr("Receipt failed", "Beleg fehlgeschlagen"), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="clab">{tr("COMPLIANCE RECEIPT · PROOF OF INNOCENCE", "COMPLIANCE-BELEG · PROOF OF INNOCENCE")}</div>
      <p className="sub" style={{ marginTop: 12 }}>
        {tr(
          "A signed attestation that selected funds belong to the ASP good-set and carry a proof of clean origin — revealing nothing else.",
          "Ein signierter Beleg, dass ausgewählte Mittel zum ASP-Good-Set gehören und einen Beweis sauberer Herkunft tragen — ohne sonst etwas preiszugeben.",
        )}
      </p>
      <div className="grid g2" style={{ marginTop: 14 }}>
        <Field label={tr("SCOPE", "UMFANG")}>
          <select
            className="input"
            value={scope}
            onChange={(e) => setScope(e.target.value as ReceiptScope)}
          >
            <option value="single">{tr("Single payment", "Einzelzahlung")}</option>
            <option value="range">{tr("Date range", "Zeitraum")}</option>
            <option value="counterparty">{tr("Counterparty", "Gegenpartei")}</option>
          </select>
        </Field>
        <Field label={tr("PERIOD", "PERIODE")}>
          <select
            className="input"
            value={periodMode}
            onChange={(e) => {
              setPeriodMode(e.target.value);
              setPeriod(e.target.value === "Custom" ? "" : e.target.value);
            }}
          >
            <option>Q2 2026</option>
            <option>Jun 2026</option>
            <option>Custom</option>
          </select>
        </Field>
      </div>
      {periodMode === "Custom" ? (
        <Field label={tr("CUSTOM PERIOD", "EIGENE PERIODE")}>
          <input
            className="input"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            placeholder={tr("e.g. 1 Apr – 30 Jun 2026", "z. B. 1. Apr – 30. Jun 2026")}
          />
        </Field>
      ) : null}
      <Field label={tr("EXPORT FORMAT", "EXPORTFORMAT")}>
        <select className="input" value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)}>
          <option value="pdf">{tr("PDF document", "PDF-Dokument")}</option>
          <option value="csv">{tr("Spreadsheet (CSV — Excel / Google Sheets)", "Tabelle (CSV — Excel / Google Sheets)")}</option>
          <option value="json">{tr("JSON (signed, machine-readable)", "JSON (signiert, maschinenlesbar)")}</option>
        </select>
      </Field>
      <div className="actions">
        <Button variant="solid" arrow onClick={generate} disabled={busy || !period.trim()}>
          {busy ? tr("Generating…", "Erstelle…") : tr(`Generate receipt · ${format.toUpperCase()}`, `Beleg erzeugen · ${format.toUpperCase()}`)}
        </Button>
      </div>
      {started ? <ProofConsole lines={lines} idle="" /> : null}
    </Card>
  );
}

function DisclosureCard() {
  const api = useApi();
  const tr = useT();
  const { data, loading, error, reload } = useAsync<Disclosure[]>(() => api.listDisclosures(), []);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [grantee, setGrantee] = useState("");
  const [scope, setScope] = useState("Q2 2026");
  const [days, setDays] = useState(14);

  async function revoke(id: string) {
    setBusyId(id);
    try {
      await api.revokeDisclosure(id);
      reload();
      toast(tr("Disclosure revoked", "Offenlegung widerrufen"), "info");
    } finally {
      setBusyId(null);
    }
  }

  async function create() {
    if (!grantee.trim()) return;
    setCreating(true);
    try {
      await api.createDisclosure({ grantee: grantee.trim(), scope, days });
      setGrantee("");
      setShowForm(false);
      reload();
      toast(tr("Read-only disclosure issued", "Schreibgeschützte Offenlegung erteilt"), "success");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Card style={{ marginTop: 18 }}>
      <div className="clab">{tr("SCOPED VIEWING-KEY DISCLOSURE", "BEGRENZTE VIEWING-KEY-OFFENLEGUNG")}</div>
      <p className="sub" style={{ marginTop: 12 }}>
        {tr(
          "Hand an auditor a read-only token limited by time and scope. They see exactly what you grant — nothing more. Revoke anytime.",
          "Gib einem Prüfer einen schreibgeschützten Token, begrenzt nach Zeit und Umfang. Er sieht genau das, was du gewährst — nicht mehr. Jederzeit widerrufbar.",
        )}
      </p>
      {loading ? (
        <div className="note">{tr("Loading disclosures…", "Lade Offenlegungen…")}</div>
      ) : error ? (
        <div className="note" style={{ color: "var(--bad)" }}>
          {error}
        </div>
      ) : (data?.length ?? 0) === 0 ? (
        <div className="note">{tr("No active disclosures.", "Keine aktiven Offenlegungen.")}</div>
      ) : (
        data!.map((d) => (
          <div className="disclosure-card" key={d.id}>
            <span className="dot2" />
            <div className="info">
              <b>{d.grantee}</b>
              <span>
                {d.scope} · {tr("expires in", "läuft ab in")} {d.expiresIn} · {d.readOnly ? tr("read-only", "nur lesen") : tr("read-write", "lesen/schreiben")}
              </span>
            </div>
            <button className="reveal-btn" onClick={() => revoke(d.id)} disabled={busyId === d.id}>
              {busyId === d.id ? "…" : tr("revoke", "widerrufen")}
            </button>
          </div>
        ))
      )}
      {showForm ? (
        <div style={{ marginTop: 14 }}>
          <Field label={tr("GRANTEE (auditor / bank / tax authority)", "EMPFÄNGER (Prüfer / Bank / Finanzamt)")}>
            <input className="input" value={grantee} onChange={(e) => setGrantee(e.target.value)} placeholder={tr("e.g. Tax authority — CH", "z. B. Finanzamt — CH")} />
          </Field>
          <div className="grid g2">
            <Field label={tr("SCOPE", "UMFANG")} style={{ marginTop: 0 }}>
              <select className="input" value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="Q2 2026">Q2 2026</option>
                <option value="Payroll only">{tr("Payroll only", "Nur Gehälter")}</option>
                <option value="Full history">{tr("Full history", "Volle Historie")}</option>
              </select>
            </Field>
            <Field label={tr("EXPIRES (DAYS)", "LÄUFT AB (TAGE)")} style={{ marginTop: 0 }}>
              <input className="input" type="number" min={1} max={365} value={days} onChange={(e) => setDays(Number(e.target.value))} />
            </Field>
          </div>
          <div className="actions">
            <Button variant="solid" onClick={create} disabled={creating || !grantee.trim()}>
              {creating ? tr("Issuing…", "Erstelle…") : tr("Issue read-only token", "Schreibgeschützten Token erstellen")}
            </Button>
            <Button onClick={() => setShowForm(false)}>{tr("Cancel", "Abbrechen")}</Button>
          </div>
        </div>
      ) : (
        <div className="actions">
          <Button onClick={() => setShowForm(true)}>{tr("+ New disclosure grant", "+ Neue Offenlegung")}</Button>
        </div>
      )}
    </Card>
  );
}

function AspCard() {
  const api = useApi();
  const tr = useT();
  const { data, loading, error } = useAsync(() => api.getAspStatus(), []);
  return (
    <Card>
      <div className="clab">{tr("ASP — ASSOCIATION SET", "ASP — ASSOCIATION-SET")}</div>
      {loading ? (
        <div className="note">{tr("Loading…", "Lädt…")}</div>
      ) : error ? (
        <div className="note" style={{ color: "var(--bad)" }}>
          {error}
        </div>
      ) : (
        <ComplianceList items={data!.items} />
      )}
    </Card>
  );
}

function JurisdictionCard() {
  const api = useApi();
  const tr = useT();
  const { data, loading, error } = useAsync(() => api.getJurisdictionProfile(), []);
  const [fmt, setFmt] = useState<ExportFormat>("pdf");
  const [exporting, setExporting] = useState(false);

  async function exportLog() {
    setExporting(true);
    try {
      await api.exportAuditLog(fmt);
      toast(tr(`Audit log exported · ${fmt.toUpperCase()}`, `Audit-Log exportiert · ${fmt.toUpperCase()}`), "success");
    } finally {
      setExporting(false);
    }
  }

  return (
    <Card style={{ marginTop: 18 }}>
      <div className="clab" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>{tr("JURISDICTION PROFILE", "JURISDIKTIONS-PROFIL")}</span>
        {data ? <span className="chip">{data.label}</span> : null}
      </div>
      {loading ? (
        <div className="note">{tr("Loading…", "Lädt…")}</div>
      ) : error ? (
        <div className="note" style={{ color: "var(--bad)" }}>
          {error}
        </div>
      ) : (
        <ComplianceList items={data!.items} />
      )}
      <div className="actions" style={{ alignItems: "center", gap: 10 }}>
        <select className="input" style={{ width: "auto" }} value={fmt} onChange={(e) => setFmt(e.target.value as ExportFormat)}>
          <option value="pdf">PDF</option>
          <option value="csv">CSV (Excel / Sheets)</option>
          <option value="json">JSON</option>
        </select>
        <Button sm onClick={exportLog} disabled={exporting}>
          {exporting ? tr("Exporting…", "Exportiere…") : tr("Export audit log", "Audit-Log exportieren")}
        </Button>
      </div>
    </Card>
  );
}
