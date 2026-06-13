import { useState } from "react";
import { useApi } from "../lib/ApiProvider";
import { useAsync } from "../lib/useAsync";
import { Button, Card, ComplianceList, Field, ScreenHead } from "../components/primitives";
import { ProofConsole } from "../components/ProofConsole";
import type { Disclosure, ProofStep, ReceiptScope } from "../lib/types";

export function Compliance() {
  return (
    <section className="view">
      <ScreenHead
        eyebrow="THE DIFFERENTIATOR"
        title="Compliance Center."
        sub="Privacy you can prove. Generate clean-origin attestations and grant scoped, time-limited disclosure to banks, auditors and tax authorities — without ever exposing your full history."
      />
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
  const [period, setPeriod] = useState("Q2 2026");
  const [lines, setLines] = useState<ProofStep[]>([]);
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);

  async function generate() {
    setBusy(true);
    setStarted(true);
    setLines([{ progress: 0, html: "assembling proof of innocence…" }]);
    try {
      await api.generateReceipt({ scope, period }, (s) => setLines((p) => [...p, s]));
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
          <select className="input" value={period} onChange={(e) => setPeriod(e.target.value)}>
            <option>Q2 2026</option>
            <option>Jun 2026</option>
            <option>Custom</option>
          </select>
        </Field>
      </div>
      <div className="actions">
        <Button variant="solid" arrow onClick={generate} disabled={busy}>
          {busy ? "Generating…" : "Generate receipt"}
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
    setCreating(true);
    try {
      await api.createDisclosure({ grantee: "New grantee", scope: "Q2 2026", days: 14 });
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
      <div className="actions">
        <Button onClick={create} disabled={creating}>
          {creating ? "Creating…" : "+ New disclosure grant"}
        </Button>
      </div>
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
  return (
    <Card style={{ marginTop: 18 }}>
      <div className="clab">JURISDICTION PROFILE</div>
      {loading ? (
        <div className="note">Loading…</div>
      ) : error ? (
        <div className="note" style={{ color: "var(--bad)" }}>
          {error}
        </div>
      ) : (
        <ComplianceList items={data!.items} />
      )}
      <div className="actions">
        <Button sm>Export audit log</Button>
      </div>
    </Card>
  );
}
