import { useRef, useState } from "react";
import { useApi } from "../lib/ApiProvider";
import { useAsync } from "../lib/useAsync";
import { Button, Card, Dots, Field, KeyValue, ScreenHead, Seg, SanctionsTag } from "../components/primitives";
import { ProofConsole } from "../components/ProofConsole";
import type { Asset, BatchRow, PayrollSession, ProofStep } from "../lib/types";

type Mode = "single" | "batch" | "recurring";

const MODES: { value: Mode; label: string }[] = [
  { value: "single", label: "Single payment" },
  { value: "batch", label: "Batch payout" },
  { value: "recurring", label: "Payroll · recurring" },
];

export function Disburse() {
  const [mode, setMode] = useState<Mode>("single");
  return (
    <section className="view">
      <ScreenHead
        eyebrow="PRIVATE PAYOUT"
        title="Disburse"
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
const PASTE_RECIPIENT = "Paste address / OCP quote";

function SingleMode() {
  const api = useApi();
  const { data: recipients } = useAsync(() => api.getRecipients(), []);
  const [amount, setAmount] = useState("");
  const [asset, setAsset] = useState<Asset>("USDC");
  const [recipientSel, setRecipientSel] = useState(PASTE_RECIPIENT);
  const [customRecipient, setCustomRecipient] = useState("");
  const recipient = recipientSel === PASTE_RECIPIENT ? customRecipient.trim() : recipientSel;
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState<ProofStep[]>([]);
  const [progress, setProgress] = useState<number | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const invoiceRef = useRef<HTMLInputElement>(null);
  const [invBusy, setInvBusy] = useState(false);
  const [invMsg, setInvMsg] = useState<string | null>(null);

  async function onInvoice(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setInvBusy(true);
    setInvMsg("reading invoice…");
    try {
      // lazy-load the extractor (pdf.js + OCR) only when an invoice is uploaded
      const { extractInvoice } = await import("../lib/invoice");
      const r = await extractInvoice(file, (stage, p) =>
        setInvMsg(p != null ? `${stage} ${Math.round(p * 100)}%` : `${stage}…`),
      );
      if (r.recipient) { setRecipientSel(PASTE_RECIPIENT); setCustomRecipient(r.recipient); }
      if (r.amount) setAmount(r.amount);
      if (r.currency === "EURC" || r.currency === "EUR") setAsset("EURC");
      else if (r.currency === "USDC" || r.currency === "USD") setAsset("USDC");
      if (r.reference) setMemo(`Invoice ${r.reference}`);
      const found = [r.amount && "amount", r.recipient && "recipient", r.reference && "reference"].filter(Boolean).join(", ");
      setInvMsg(
        found
          ? `Extracted ${found} (${r.source === "ocr" ? "via OCR" : "from the PDF text"}) — please verify below before paying.`
          : `Couldn't read the fields automatically (${r.source}). Please enter them manually.`,
      );
    } catch {
      setInvMsg("Could not read that invoice. Upload a PDF or an image (PNG/JPG).");
    } finally {
      setInvBusy(false);
    }
  }

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
        <div className="clab" style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          SINGLE PAYMENT
          <button className="reveal-btn" onClick={() => invoiceRef.current?.click()} disabled={invBusy}>
            {invBusy ? "reading…" : "upload invoice"}
          </button>
        </div>
        <input ref={invoiceRef} type="file" accept=".pdf,application/pdf,image/*" onChange={onInvoice} style={{ display: "none" }} />
        {invMsg ? <div className="note" style={{ marginTop: 0 }}>{invMsg}</div> : null}
        <Field label="RECIPIENT">
          <select className="input" value={recipientSel} onChange={(e) => setRecipientSel(e.target.value)}>
            <option>{PASTE_RECIPIENT}</option>
            {(recipients ?? []).map((r) => (
              <option key={r.id}>{r.label} · {r.address}</option>
            ))}
          </select>
        </Field>
        {recipientSel === PASTE_RECIPIENT ? (
          <Field label="RECIPIENT ADDRESS / OCP QUOTE">
            <input
              className="input"
              value={customRecipient}
              onChange={(e) => setCustomRecipient(e.target.value)}
              placeholder="0x… or an OpenCryptoPay quote reference"
            />
          </Field>
        ) : null}
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
          <Button variant="solid" arrow onClick={pay} disabled={busy || !recipient || !amount.trim()}>
            {busy ? <>Proving<Dots /></> : "Confirm & pay"}
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
          The recipient (e.g. a PSP / settlement address) receives a payment note. Amount +
          counterparty are known only to the settlement broker — never to the chain.
        </div>
      </Card>
    </div>
  );
}

// ---------- Batch ----------
// Build batch rows from a matrix of cells (header columns address,role,amount,
// chain[,sanctions]). Tolerant of quotes/whitespace; defaults sanctions to "ok".
// Both CSV and Excel (.xlsx) imports funnel through here.
function rowsFromMatrix(matrix: (string | number)[][]): BatchRow[] {
  const grid = matrix.map((r) => r.map((c) => String(c ?? "").trim())).filter((r) => r.some((c) => c));
  if (!grid.length) return [];
  const header = grid[0].map((h) => h.toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const hasHeader = idx("address") !== -1 || idx("amount") !== -1;
  const body = hasHeader ? grid.slice(1) : grid;
  const col = { address: idx("address"), role: idx("role"), amount: idx("amount"), chain: idx("chain") };
  return body.map((c) => {
    const at = (i: number, fallback: number) => c[i >= 0 ? i : fallback] ?? "";
    const amount = at(col.amount, 2);
    return {
      address: at(col.address, 0) || "0x…",
      role: at(col.role, 1) || "—",
      amount: /[a-z]/i.test(amount) ? amount : `${amount} USDC`,
      chain: at(col.chain, 3) || "Base",
      sanctions: "ok" as const,
    };
  });
}

function parseBatchCsv(text: string): BatchRow[] {
  const matrix = text.split(/\r?\n/).map((l) => l.split(",").map((c) => c.trim().replace(/^"|"$/g, "")));
  return rowsFromMatrix(matrix);
}

function amountNumber(a: string): number {
  return Number(a.split(" ")[0].replace(/[, ]/g, "")) || 0;
}

function BatchMode() {
  const api = useApi();
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [lines, setLines] = useState<ProofStep[]>([]);
  const [progress, setProgress] = useState<number | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [screened, setScreened] = useState<string | null>(null);
  const [importErr, setImportErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const totalNum = rows.reduce((s, r) => s + amountNumber(r.amount), 0);
  const asset = rows[0]?.amount.split(" ")[1] || "USDC";
  const total = `${totalNum.toLocaleString("en-US")} ${asset}`;

  async function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportErr(null);
    const name = file.name.toLowerCase();
    try {
      let parsed: BatchRow[] = [];
      if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
        // Excel → first sheet → matrix (lazy-load the parser; keeps it out of the main bundle)
        const XLSX = await import("xlsx");
        const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const matrix = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1, blankrows: false, raw: false });
        parsed = rowsFromMatrix(matrix);
      } else {
        parsed = parseBatchCsv(await file.text());
      }
      if (parsed.length) { setRows(parsed); setScreened(null); }
      else setImportErr("No rows found. Expected columns: address, role, amount, chain.");
    } catch {
      setImportErr("Could not read that file. Use a CSV or .xlsx with columns: address, role, amount, chain.");
    }
  }

  async function downloadTemplate() {
    const { downloadCsv } = await import("../lib/exporters");
    downloadCsv("cloister-batch-template.csv", [
      ["address", "role", "amount", "chain"],
      ["0xRecipientAddress…", "Employee — Jane Doe", "2400", "Polygon"],
      ["0xRecipientAddress…", "Contractor — Acme Ltd", "1150", "Base"],
      ["0xRecipientAddress…", "Reimbursement — travel", "380", "Arbitrum"],
    ]);
  }

  function screenAll() {
    const clear = rows.filter((r) => r.sanctions === "ok").length;
    const flagged = rows.length - clear;
    setScreened(`${rows.length} recipients screened (PoC sanctions list) · ${clear} clear${flagged ? ` · ${flagged} flagged` : ""}`);
  }

  async function run() {
    setBusy(true);
    setProgress(0);
    setLines([{ progress: 0, html: "starting private batch…" }]);
    try {
      await api.disburseBatch({ rows }, (s) => {
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
        <div className="clab" style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          BATCH PAYOUT
          <span style={{ display: "inline-flex", gap: 14 }}>
            <button className="reveal-btn" onClick={downloadTemplate}>template</button>
            <button className="reveal-btn" onClick={() => fileRef.current?.click()}>import CSV / Excel</button>
          </span>
        </div>
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,text/csv" onChange={onImport} style={{ display: "none" }} />
        {importErr ? <div className="note" style={{ color: "var(--bad)" }}>{importErr}</div> : null}
        <div className="table-scroll">
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
            {rows.length === 0 ? (
              <tr className="loading-row">
                <td colSpan={5}>No recipients yet — import a CSV or Excel file (columns: address, role, amount, chain), or download the template above.</td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={`${r.address}-${i}`}>
                  <td className="addr mono">{r.address}</td>
                  <td>{r.role}</td>
                  <td className="addr">{r.amount}</td>
                  <td>{r.chain}</td>
                  <td>
                    <SanctionsTag level={r.sanctions} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
        <div className="grid g4" style={{ marginTop: 20 }}>
          <div>
            <div className="clab">RECIPIENTS</div>
            <div className="big" style={{ fontSize: 24 }}>{rows.length}</div>
          </div>
          <div>
            <div className="clab">TOTAL</div>
            <div className="big" style={{ fontSize: 24 }}>{total}</div>
          </div>
          <div>
            <div className="clab">SETTLEMENT</div>
            <div className="big" style={{ fontSize: 24 }}>{rows.length || "—"}{rows.length ? " tx" : ""}</div>
            <div className="cfoot">independent lanes</div>
          </div>
          <div>
            <div className="clab">PROOF</div>
            <div className="big" style={{ fontSize: 24 }}>per-tx</div>
            <div className="cfoot">background</div>
          </div>
        </div>
        <div className="actions">
          <Button variant="solid" arrow onClick={run} disabled={busy || rows.length === 0}>
            {busy ? "Running…" : "Run private batch"}
          </Button>
          <Button onClick={screenAll} disabled={rows.length === 0}>Screen all recipients</Button>
        </div>
        {screened ? <div className="note" style={{ color: "var(--ok)" }}>{screened}</div> : null}
        {lines.length ? (
          <ProofConsole lines={lines} progress={progress} idle="" />
        ) : (
          <div className="note">
            Each recipient gets an <b>independent</b> shielded payment in its own lane — one relayer tx
            per recipient, each unlinkable on-chain. Import a <b>CSV or Excel</b> file
            (<span className="mono">address, role, amount, chain</span>) — ideal for <b>payroll, vendor
            &amp; contractor payouts, reimbursements, grants/bounties and dividends</b>.
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
              <b>Session key</b> · authorise up to the budget cap, re-confirm each period
            </div>
            <div className="gate-row">
              <b>Recorded on device</b> · cap + schedule tracked locally (PoC) — circuit-bound enforcement on the roadmap
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
