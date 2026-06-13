import { useState } from "react";
import { useApi } from "../lib/ApiProvider";
import { useAsync } from "../lib/useAsync";
import { Button, Card, Field, KeyValue, ScreenHead, Seg, Tag } from "../components/primitives";
import { ProofConsole } from "../components/ProofConsole";
import type { Asset, BatchRow, PayrollSession, ProofStep } from "../lib/types";

type Mode = "single" | "batch" | "recurring";

const MODES: { value: Mode; label: string }[] = [
  { value: "single", label: "Single payment" },
  { value: "batch", label: "Batch payout" },
  { value: "recurring", label: "Payroll · recurring" },
];

const BATCH_ROWS: BatchRow[] = [
  { address: "0x7a3f…9c2d", role: "Core dev", amount: "8,000 USDC", chain: "Base", sanctions: "ok" },
  { address: "0x1b88…4e10", role: "Designer", amount: "4,200 USDC", chain: "Base", sanctions: "ok" },
  { address: "0xc4d2…77a1", role: "Ops", amount: "3,500 USDC", chain: "Polygon", sanctions: "ok" },
  { address: "0x90fa…12bc", role: "Auditor", amount: "6,000 USDC", chain: "Base", sanctions: "ok" },
];

export function Disburse() {
  const [mode, setMode] = useState<Mode>("single");
  return (
    <section className="view">
      <ScreenHead
        eyebrow="PRIVATE PAYOUT"
        title="Disburse."
        sub="Pay anyone — privately and compliantly. The proof generates in the background while you confirm, so it feels instant."
      />
      <div style={{ marginTop: 22 }}>
        <Seg value={mode} onChange={setMode} options={MODES} />
      </div>
      {mode === "single" ? <SingleMode /> : mode === "batch" ? <BatchMode /> : <RecurringMode />}
    </section>
  );
}

// ---------- Single ----------
function SingleMode() {
  const api = useApi();
  const [amount, setAmount] = useState("12,500");
  const [asset, setAsset] = useState<Asset>("USDC");
  const [recipient, setRecipient] = useState("Acme GmbH (B2B settlement)");
  const [memo, setMemo] = useState("Invoice #INV-2291 — Q2 services");
  const [lines, setLines] = useState<ProofStep[]>([]);
  const [progress, setProgress] = useState<number | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  async function pay() {
    setBusy(true);
    setProgress(0);
    setLines([{ progress: 0, html: "confirm received — proof was pre-warming…" }]);
    try {
      const res = await api.disburseSingle({ recipient, amount, asset, memo }, (s) => {
        setProgress(s.progress);
        setLines((prev) => [...prev, s]);
      });
      if (res.receiptAvailable) {
        setLines((prev) => [
          ...prev,
          { progress: 100, html: "<span class='ok'>receipt available in Compliance Center.</span>" },
        ]);
      }
    } catch (e) {
      setLines((prev) => [
        ...prev,
        { progress: 100, html: `<span class='w'>error: ${(e as Error).message}</span>` },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="split" style={{ marginTop: 22 }}>
      <Card>
        <div className="clab">SINGLE PAYMENT</div>
        <Field label="RECIPIENT">
          <select className="input" value={recipient} onChange={(e) => setRecipient(e.target.value)}>
            <option>Acme GmbH (B2B settlement)</option>
            <option>Paste address / OCP quote / scan QR</option>
            <option>Contributor — 0x7a…</option>
          </select>
        </Field>
        <div className="grid g2">
          <Field label="AMOUNT">
            <input className="input" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="ASSET">
            <select className="input" value={asset} onChange={(e) => setAsset(e.target.value as Asset)}>
              <option>USDC</option>
              <option>EURC</option>
            </select>
          </Field>
        </div>
        <Field label="MEMO (encrypted — viewing-key only)">
          <input className="input" value={memo} onChange={(e) => setMemo(e.target.value)} />
        </Field>
        <div className="actions">
          <Button variant="solid" arrow onClick={pay} disabled={busy}>
            {busy ? "Proving…" : "Confirm & pay"}
          </Button>
        </div>
        <ProofConsole
          lines={lines}
          progress={progress}
          idle="ready. Proof pre-warms on confirm…"
        />
      </Card>
      <Card>
        <div className="clab">ON-CHAIN OBSERVER SEES</div>
        <div style={{ marginTop: 14 }}>
          <KeyValue k="tx.from" tone="priv">relayer (not you)</KeyValue>
          <KeyValue k="Payer address" tone="priv">absent</KeyValue>
          <KeyValue k="Recipient" tone="priv">absent on-chain</KeyValue>
          <KeyValue k="Amount" tone="priv">absent on-chain</KeyValue>
          <KeyValue k="Nullifier" tone="mono">published</KeyValue>
          <KeyValue k="ASP inclusion" tone="pub">proven clean</KeyValue>
        </div>
        <div className="note">
          The recipient (e.g. DFX/OCP settlement address) receives a payment note. Amount +
          counterparty are known only to the settlement broker — never to the chain.
        </div>
      </Card>
    </div>
  );
}

// ---------- Batch ----------
function BatchMode() {
  const api = useApi();
  const [lines, setLines] = useState<ProofStep[]>([]);
  const [progress, setProgress] = useState<number | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const total = "21,700";

  async function run() {
    setBusy(true);
    setProgress(0);
    setLines([{ progress: 0, html: "starting private batch…" }]);
    try {
      await api.disburseBatch({ rows: BATCH_ROWS }, (s) => {
        setProgress(s.progress);
        setLines((prev) => [...prev, s]);
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="split" style={{ marginTop: 22 }}>
      <Card style={{ gridColumn: "1 / -1" }}>
        <div className="clab" style={{ display: "flex", justifyContent: "space-between" }}>
          BATCH PAYOUT — DAO CONTRIBUTORS <button className="reveal-btn">import CSV</button>
        </div>
        <table style={{ marginTop: 10 }}>
          <thead>
            <tr>
              <th>Recipient</th>
              <th>Role</th>
              <th>Amount</th>
              <th>Chain</th>
              <th>Sanctions</th>
            </tr>
          </thead>
          <tbody>
            {BATCH_ROWS.map((r) => (
              <tr key={r.address}>
                <td className="addr mono">{r.address}</td>
                <td>{r.role}</td>
                <td className="addr">{r.amount}</td>
                <td>{r.chain}</td>
                <td>
                  <Tag level="ok">clear</Tag>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="grid g4" style={{ marginTop: 20 }}>
          <div>
            <div className="clab">RECIPIENTS</div>
            <div className="big" style={{ fontSize: 24 }}>{BATCH_ROWS.length}</div>
          </div>
          <div>
            <div className="clab">TOTAL</div>
            <div className="big" style={{ fontSize: 24 }}>{total}</div>
          </div>
          <div>
            <div className="clab">SETTLEMENT</div>
            <div className="big" style={{ fontSize: 24 }}>1 tx</div>
            <div className="cfoot">aggregated</div>
          </div>
          <div>
            <div className="clab">EST. PROOF</div>
            <div className="big" style={{ fontSize: 24 }}>~9 s</div>
            <div className="cfoot">background</div>
          </div>
        </div>
        <div className="actions">
          <Button variant="solid" arrow onClick={run} disabled={busy}>
            {busy ? "Running…" : "Run private batch"}
          </Button>
          <Button>Screen all recipients</Button>
        </div>
        {lines.length ? (
          <ProofConsole lines={lines} progress={progress} idle="" />
        ) : (
          <div className="note">
            Each recipient gets an independent shielded payment (different lanes → same block). One
            aggregated unshield settles them — on-chain it looks like a single opaque movement.
          </div>
        )}
      </Card>
    </div>
  );
}

// ---------- Recurring ----------
function RecurringMode() {
  const api = useApi();
  const session = useAsync<PayrollSession>(() => api.getPayrollSession(), []);
  const [schedule, setSchedule] = useState("Monthly · 1st");
  const [budgetCap, setBudgetCap] = useState("60,000 USDC");
  const [busy, setBusy] = useState(false);
  const [authorized, setAuthorized] = useState(false);

  async function authorize() {
    setBusy(true);
    try {
      await api.authorizePayrollSession({ schedule, budgetCap });
      setAuthorized(true);
    } finally {
      setBusy(false);
    }
  }

  const ps = session.data;
  return (
    <div className="split" style={{ marginTop: 22 }}>
      <Card>
        <div className="clab">PAYROLL — RECURRING</div>
        <div className="grid g2">
          <Field label="SCHEDULE">
            <select className="input" value={schedule} onChange={(e) => setSchedule(e.target.value)}>
              <option>Monthly · 1st</option>
              <option>Bi-weekly</option>
              <option>Weekly</option>
            </select>
          </Field>
          <Field label="BUDGET CAP">
            <input className="input" value={budgetCap} onChange={(e) => setBudgetCap(e.target.value)} />
          </Field>
        </div>
        <Field label="SPENDING SESSION">
          <div className="gatebox">
            <div className="gate-row">
              <b>Session key</b> · authorise up to budget cap, expires after each run
            </div>
            <div className="gate-row">
              <b>Bound in circuit</b> · limit + expiry enforced cryptographically
            </div>
            <div className="gate-row">
              <b>Near-instant</b> · subsequent payouts skip re-auth
            </div>
          </div>
        </Field>
        <div className="actions">
          <Button variant="solid" arrow onClick={authorize} disabled={busy || authorized}>
            {authorized ? "Session authorised" : busy ? "Authorising…" : "Authorise payroll session"}
          </Button>
        </div>
        <div className="note">
          Programmatic/oracle payouts use the same session model via API — pre-authorised,
          rate-limited, fully auditable.
        </div>
      </Card>
      <Card>
        <div className="clab">NEXT RUN</div>
        <div className="big" style={{ fontSize: 24, marginTop: 14 }}>
          {ps?.nextRun ?? "—"}
        </div>
        <div className="cfoot">
          {ps ? `${ps.recipients} recipients · ${ps.amount}` : "—"}
        </div>
        <div className="kv" style={{ marginTop: 18 }}>
          <span className="k">Last run</span>
          <span className="v">{ps?.lastRun ?? "—"}</span>
        </div>
        <div className="kv">
          <span className="k">Receipts</span>
          <span className="v">auto-archived</span>
        </div>
      </Card>
    </div>
  );
}
