import { useState } from "react";
import { useApi } from "../lib/ApiProvider";
import { useSession } from "../lib/SessionProvider";
import { useAsync } from "../lib/useAsync";
import { Button, Card, ComplianceList, Field, ScreenHead } from "../components/primitives";
import { ProofConsole } from "../components/ProofConsole";
import { KycVerify } from "../components/KycVerify";
import type { Disclosure, ExportFormat, ProofStep, ReceiptScope } from "../lib/types";

export function Compliance() {
  const { session } = useSession();
  return (
    <section className="view">
      <ScreenHead
        eyebrow="THE DIFFERENTIATOR"
        title="Compliance Center"
        sub="Privacy you can prove. Generate clean-origin attestations and grant scoped, time-limited disclosure to banks, auditors and tax authorities — without ever exposing your full history."
      />
      {session && session.kyc.status !== "verified" ? (
        <Card style={{ marginTop: 26 }}>
          <div className="clab">VERIFY IDENTITY — UNLOCK PAYOUTS</div>
          <p className="sub" style={{ marginTop: 10 }}>
            Complete identity verification with a regulated account to enable funding and private
            payouts. Connect an existing account or create one — your full history stays private; only
            your clean-origin status is recorded.
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
    setLines([{ progress: 0, html: "assembling proof of innocence…" }]);
    try {
      await api.generateReceipt({ scope, period, format }, (s) => setLines((p) => [...p, s]));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="clab">COMPLIANCE RECEIPT · PROOF OF INNOCENCE</div>
      <p className="sub" style={{ marginTop: 12 }}>
        A signed attestation that selected funds belong to the ASP good-set and originate from a
        KYC'd source — revealing nothing else.
      </p>
      <div className="grid g2" style={{ marginTop: 14 }}>
        <Field label="SCOPE">
          <select
            className="input"
            value={scope}
            onChange={(e) => setScope(e.target.value as ReceiptScope)}
          >
            <option value="single">Single payment</option>
            <option value="range">Date range</option>
            <option value="counterparty">Counterparty</option>
          </select>
        </Field>
        <Field label="PERIOD">
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
        <Field label="CUSTOM PERIOD">
          <input
            className="input"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            placeholder="e.g. 1 Apr – 30 Jun 2026"
          />
        </Field>
      ) : null}
      <Field label="EXPORT FORMAT">
        <select className="input" value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)}>
          <option value="pdf">PDF document</option>
          <option value="csv">Spreadsheet (CSV — Excel / Google Sheets)</option>
          <option value="json">JSON (signed, machine-readable)</option>
        </select>
      </Field>
      <div className="actions">
        <Button variant="solid" arrow onClick={generate} disabled={busy || !period.trim()}>
          {busy ? "Generating…" : `Generate receipt · ${format.toUpperCase()}`}
        </Button>
      </div>
      {started ? <ProofConsole lines={lines} idle="" /> : null}
    </Card>
  );
}

function DisclosureCard() {
  const api = useApi();
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
    } finally {
      setCreating(false);
    }
  }

  return (
    <Card style={{ marginTop: 18 }}>
      <div className="clab">SCOPED VIEWING-KEY DISCLOSURE</div>
      <p className="sub" style={{ marginTop: 12 }}>
        Hand an auditor a read-only token limited by time and scope. They see exactly what you grant
        — nothing more. Revoke anytime.
      </p>
      {loading ? (
        <div className="note">Loading disclosures…</div>
      ) : error ? (
        <div className="note" style={{ color: "var(--bad)" }}>
          {error}
        </div>
      ) : (data?.length ?? 0) === 0 ? (
        <div className="note">No active disclosures.</div>
      ) : (
        data!.map((d) => (
          <div className="disclosure-card" key={d.id}>
            <span className="dot2" />
            <div className="info">
              <b>{d.grantee}</b>
              <span>
                {d.scope} · expires in {d.expiresIn} · {d.readOnly ? "read-only" : "read-write"}
              </span>
            </div>
            <button className="reveal-btn" onClick={() => revoke(d.id)} disabled={busyId === d.id}>
              {busyId === d.id ? "…" : "revoke"}
            </button>
          </div>
        ))
      )}
      {showForm ? (
        <div style={{ marginTop: 14 }}>
          <Field label="GRANTEE (auditor / bank / tax authority)">
            <input className="input" value={grantee} onChange={(e) => setGrantee(e.target.value)} placeholder="e.g. Tax authority — CH" />
          </Field>
          <div className="grid g2">
            <Field label="SCOPE" style={{ marginTop: 0 }}>
              <select className="input" value={scope} onChange={(e) => setScope(e.target.value)}>
                <option>Q2 2026</option>
                <option>Payroll only</option>
                <option>Full history</option>
              </select>
            </Field>
            <Field label="EXPIRES (DAYS)" style={{ marginTop: 0 }}>
              <input className="input" type="number" min={1} max={365} value={days} onChange={(e) => setDays(Number(e.target.value))} />
            </Field>
          </div>
          <div className="actions">
            <Button variant="solid" onClick={create} disabled={creating || !grantee.trim()}>
              {creating ? "Issuing…" : "Issue read-only token"}
            </Button>
            <Button onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="actions">
          <Button onClick={() => setShowForm(true)}>+ New disclosure grant</Button>
        </div>
      )}
    </Card>
  );
}

function AspCard() {
  const api = useApi();
  const { data, loading, error } = useAsync(() => api.getAspStatus(), []);
  return (
    <Card>
      <div className="clab">ASP — ASSOCIATION SET</div>
      {loading ? (
        <div className="note">Loading…</div>
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
  const { data, loading, error } = useAsync(() => api.getJurisdictionProfile(), []);
  const [fmt, setFmt] = useState<ExportFormat>("pdf");
  const [exporting, setExporting] = useState(false);

  async function exportLog() {
    setExporting(true);
    try {
      await api.exportAuditLog(fmt);
    } finally {
      setExporting(false);
    }
  }

  return (
    <Card style={{ marginTop: 18 }}>
      <div className="clab" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>JURISDICTION PROFILE</span>
        {data ? <span className="chip">{data.label}</span> : null}
      </div>
      {loading ? (
        <div className="note">Loading…</div>
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
          {exporting ? "Exporting…" : "Export audit log"}
        </Button>
      </div>
    </Card>
  );
}
