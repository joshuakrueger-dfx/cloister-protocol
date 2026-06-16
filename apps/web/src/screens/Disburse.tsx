import { useRef, useState } from "react";
import { useApi } from "../lib/ApiProvider";
import { useAsync } from "../lib/useAsync";
import { Button, Card, Dots, Field, KeyValue, ScreenHead, Seg, SanctionsTag } from "../components/primitives";
import { ProofConsole } from "../components/ProofConsole";
import { toast } from "../lib/overlays";
import { getApprovalThreshold, getRequireApproval } from "../lib/prefs";
import { useT } from "../lib/i18n";
import { getMd, mdLabel, codingLabel } from "../lib/masterdata";
import type { Accounting, Asset, BatchRow, PayrollSession, ProofStep } from "../lib/types";

type Mode = "single" | "batch" | "recurring";

// upload glyph (arrow into a tray) for the drag & drop zones
const UPLOAD_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 15.5V4" />
    <path d="M8 8l4-4 4 4" />
    <path d="M4 14v3.5A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5V14" />
  </svg>
);

// Returns a cleaned Accounting object, or undefined when no field is filled — so
// payments without coding don't carry an empty object through to the ledger.
function cleanAccounting(a: Accounting): Accounting | undefined {
  const out: Accounting = {};
  (Object.keys(a) as (keyof Accounting)[]).forEach((k) => {
    const v = (a[k] ?? "").trim();
    if (v) out[k] = v;
  });
  return Object.keys(out).length ? out : undefined;
}

// Kontierung — optional cost-accounting block. Inputs use datalists fed from the
// Stammdaten lists, so a controller picks "1000 · Sales" or types a free code.
function AccountingSection({ value, onChange }: { value: Accounting; onChange: (a: Accounting) => void }) {
  const tr = useT();
  const [open, setOpen] = useState(false);
  const ccs = getMd("costCenters");
  const gls = getMd("glAccounts");
  const prj = getMd("projects");
  const tax = getMd("taxCodes");
  const filled = cleanAccounting(value);
  const set = (k: keyof Accounting, v: string) => onChange({ ...value, [k]: v });
  return (
    <div className="acct-block">
      <button type="button" className="acct-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span>{tr("Cost accounting (Kontierung)", "Kontierung")}{filled ? <span className="acct-badge">{Object.keys(filled).length}</span> : null}</span>
        <span className="acct-chev">{open ? "▾" : "▸"}</span>
      </button>
      {open ? (
        <div className="grid g2" style={{ marginTop: 4 }}>
          <Field label={tr("COST CENTER", "KOSTENSTELLE")}>
            <input className="input" list="md-cc" value={value.costCenter ?? ""} onChange={(e) => set("costCenter", e.target.value)} placeholder={tr("e.g. 2000 · Sales", "z. B. 2000 · Vertrieb")} />
          </Field>
          <Field label={tr("GL ACCOUNT", "SACHKONTO")}>
            <input className="input" list="md-gl" value={value.glAccount ?? ""} onChange={(e) => set("glAccount", e.target.value)} placeholder={tr("e.g. 6300 · External services", "z. B. 6300 · Fremdleistungen")} />
          </Field>
          <Field label={tr("PROJECT / ORDER", "PROJEKT / INNENAUFTRAG")}>
            <input className="input" list="md-prj" value={value.project ?? ""} onChange={(e) => set("project", e.target.value)} placeholder={tr("optional", "optional")} />
          </Field>
          <Field label={tr("POSTING DATE", "BUCHUNGSDATUM")}>
            <input className="input" type="date" value={value.postingDate ?? ""} onChange={(e) => set("postingDate", e.target.value)} />
          </Field>
          <Field label={tr("TAX CODE", "STEUERSCHLÜSSEL")}>
            <input className="input" list="md-tax" value={value.taxCode ?? ""} onChange={(e) => set("taxCode", e.target.value)} placeholder={tr("optional", "optional")} />
          </Field>
          <datalist id="md-cc">{ccs.map((i) => <option key={i.code} value={mdLabel(i)} />)}</datalist>
          <datalist id="md-gl">{gls.map((i) => <option key={i.code} value={mdLabel(i)} />)}</datalist>
          <datalist id="md-prj">{prj.map((i) => <option key={i.code} value={mdLabel(i)} />)}</datalist>
          <datalist id="md-tax">{tax.map((i) => <option key={i.code} value={mdLabel(i)} />)}</datalist>
        </div>
      ) : null}
    </div>
  );
}

export function Disburse() {
  const [mode, setMode] = useState<Mode>("single");
  const tr = useT();
  const modes: { value: Mode; label: string }[] = [
    { value: "single", label: tr("Single payment", "Einzelzahlung") },
    { value: "batch", label: tr("Batch payout", "Sammelauszahlung") },
    { value: "recurring", label: tr("Payroll · recurring", "Gehalt · wiederkehrend") },
  ];
  return (
    <section className="view">
      <ScreenHead
        eyebrow={tr("PRIVATE PAYOUT", "PRIVATE AUSZAHLUNG")}
        title={tr("Disburse", "Auszahlen")}
        sub={tr(
          "Pay anyone — privately and compliantly. The proof generates in the background while you confirm, so it feels instant.",
          "Zahle an jeden — privat und compliant. Der Beweis entsteht im Hintergrund, während du bestätigst — fühlt sich sofort an.",
        )}
      />
      <div style={{ marginTop: 22 }}>
        <Seg value={mode} onChange={setMode} options={modes} />
      </div>
      {mode === "single" ? <SingleMode /> : mode === "batch" ? <BatchMode /> : <RecurringMode />}
    </section>
  );
}

// ---------- Single ----------
const PASTE_RECIPIENT = "Paste address / OCP quote";

function SingleMode() {
  const api = useApi();
  const tr = useT();
  const { data: recipients } = useAsync(() => api.getRecipients(), []);
  const [amount, setAmount] = useState("");
  const [asset, setAsset] = useState<Asset>("USDC");
  const [recipientSel, setRecipientSel] = useState(PASTE_RECIPIENT);
  const [customRecipient, setCustomRecipient] = useState("");
  const recipient = recipientSel === PASTE_RECIPIENT ? customRecipient.trim() : recipientSel;
  const [memo, setMemo] = useState("");
  const [acct, setAcct] = useState<Accounting>({});
  const [lines, setLines] = useState<ProofStep[]>([]);
  const [progress, setProgress] = useState<number | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const invoiceRef = useRef<HTMLInputElement>(null);
  const [invBusy, setInvBusy] = useState(false);
  const [invMsg, setInvMsg] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);

  async function handleInvoice(file?: File) {
    if (!file) return;
    setInvBusy(true);
    setInvMsg(tr("Reading invoice…", "Lese Rechnung…"));
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
      if (r.reference) setMemo(`${tr("Invoice", "Rechnung")} ${r.reference}`);
      const src = r.source === "ocr" ? tr("via OCR", "per OCR") : tr("from the PDF text", "aus dem PDF-Text");
      setInvMsg(
        r.amount || r.recipient || r.reference
          ? tr(`Extracted fields (${src}) — please verify below before paying.`, `Felder erkannt (${src}) — bitte unten vor dem Zahlen prüfen.`)
          : tr(`Couldn't read the fields automatically (${src}). Please enter them manually.`, `Felder konnten nicht automatisch gelesen werden (${src}). Bitte manuell eingeben.`),
      );
    } catch {
      setInvMsg(tr("Could not read that invoice. Upload a PDF or an image (PNG/JPG).", "Diese Rechnung konnte nicht gelesen werden. Lade ein PDF oder Bild (PNG/JPG) hoch."));
    } finally {
      setInvBusy(false);
    }
  }
  function onInvoice(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    handleInvoice(f);
  }

  async function pay() {
    const accounting = cleanAccounting(acct);
    // maker-checker: amounts at/above the threshold need a second approver (when enabled)
    if (getRequireApproval() && amountNumber(amount) >= getApprovalThreshold()) {
      setBusy(true);
      try {
        await api.requestApproval({ kind: "single", summary: recipient, amount: `${amount} ${asset}`, single: { recipient, amount, asset, memo, accounting } });
        setLines([{ progress: 100, html: `<span class='ok'>${tr("submitted for dual approval — see <b>Approvals</b>.", "zur Zweit-Freigabe eingereicht — siehe <b>Freigaben</b>.")}</span>` }]);
        toast(tr("Submitted for approval — needs a second approver", "Zur Freigabe eingereicht — braucht einen Zweit-Freigeber"), "info");
      } catch (e) {
        toast(e instanceof Error ? e.message : "Could not submit", "error");
      } finally {
        setBusy(false);
      }
      return;
    }
    setBusy(true);
    setProgress(0);
    setLines([{ progress: 0, html: "confirm received — proof was pre-warming…" }]);
    try {
      const res = await api.disburseSingle({ recipient, amount, asset, memo, accounting }, (s) => {
        setProgress(s.progress);
        setLines((prev) => [...prev, s]);
      });
      if (res.receiptAvailable) {
        setLines((prev) => [
          ...prev,
          { progress: 100, html: `<span class='ok'>${tr("receipt available in Compliance Center.", "Beleg im Compliance-Center verfügbar.")}</span>` },
        ]);
      }
      toast(tr("Payment sent privately", "Zahlung privat gesendet"), "success");
    } catch (e) {
      setLines((prev) => [
        ...prev,
        { progress: 100, html: `<span class='w'>error: ${(e as Error).message}</span>` },
      ]);
      toast((e as Error).message || tr("Payment failed", "Zahlung fehlgeschlagen"), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="split" style={{ marginTop: 22 }}>
      <Card
        className={drag ? "drag" : ""}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={(e) => { if (e.currentTarget === e.target) setDrag(false); }}
        onDrop={(e) => { e.preventDefault(); setDrag(false); handleInvoice(e.dataTransfer.files?.[0]); }}
      >
        <div className="clab">{tr("SINGLE PAYMENT", "EINZELZAHLUNG")}</div>
        <input ref={invoiceRef} type="file" accept=".pdf,application/pdf,image/*" onChange={onInvoice} style={{ display: "none" }} />
        <div className="dropzone sm" onClick={() => invoiceRef.current?.click()} role="button" tabIndex={0}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && invoiceRef.current?.click()}>
          <div className="dz-ic">{UPLOAD_ICON}</div>
          <div className="dz-t">{invBusy ? tr("Reading invoice…", "Lese Rechnung…") : tr("Drop an invoice to auto-fill", "Rechnung ablegen — füllt automatisch aus")}</div>
          <div className="dz-s">{tr("PDF or image — we read the recipient, amount and reference. Or click to browse.", "PDF oder Bild — wir lesen Empfänger, Betrag und Referenz. Oder klicken zum Auswählen.")}</div>
        </div>
        {invMsg ? <div className="note" style={{ marginTop: 12 }}>{invMsg}</div> : null}
        <Field label={tr("RECIPIENT", "EMPFÄNGER")}>
          <select className="input" value={recipientSel} onChange={(e) => setRecipientSel(e.target.value)}>
            <option value={PASTE_RECIPIENT}>{tr("Paste address / OCP quote", "Adresse einfügen / OCP-Quote")}</option>
            {(recipients ?? []).map((r) => (
              <option key={r.id}>{r.label} · {r.address}</option>
            ))}
          </select>
        </Field>
        {recipientSel === PASTE_RECIPIENT ? (
          <Field label={tr("RECIPIENT ADDRESS / OCP QUOTE", "EMPFÄNGERADRESSE / OCP-QUOTE")}>
            <input
              className="input"
              value={customRecipient}
              onChange={(e) => setCustomRecipient(e.target.value)}
              placeholder={tr("0x… or an OpenCryptoPay quote reference", "0x… oder eine OpenCryptoPay-Quote-Referenz")}
            />
          </Field>
        ) : null}
        <div className="grid g2">
          <Field label={tr("AMOUNT", "BETRAG")}>
            <input className="input" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="ASSET">
            <select className="input" value={asset} onChange={(e) => setAsset(e.target.value as Asset)}>
              <option>USDC</option>
              <option>EURC</option>
            </select>
          </Field>
        </div>
        <Field label={tr("MEMO (encrypted — viewing-key only)", "MEMO (verschlüsselt — nur Viewing-Key)")}>
          <input className="input" value={memo} onChange={(e) => setMemo(e.target.value)} />
        </Field>
        <AccountingSection value={acct} onChange={setAcct} />
        <div className="actions">
          <Button variant="solid" arrow onClick={pay} disabled={busy || !recipient || !amount.trim()}>
            {busy ? <>{tr("Proving", "Beweise")}<Dots /></> : tr("Confirm & pay", "Bestätigen & zahlen")}
          </Button>
        </div>
        <ProofConsole
          lines={lines}
          progress={progress}
          idle={tr("ready. Proof pre-warms on confirm…", "bereit. Beweis wärmt beim Bestätigen vor…")}
        />
      </Card>
      <Card>
        <div className="clab">{tr("ON-CHAIN OBSERVER SEES", "WAS EIN ON-CHAIN-BEOBACHTER SIEHT")}</div>
        <div style={{ marginTop: 14 }}>
          <KeyValue k="tx.from" tone="priv">{tr("relayer (not you)", "Relayer (nicht du)")}</KeyValue>
          <KeyValue k={tr("Payer address", "Zahler-Adresse")} tone="priv">{tr("absent", "fehlt")}</KeyValue>
          <KeyValue k={tr("Recipient", "Empfänger")} tone="priv">{tr("absent on-chain", "on-chain nicht vorhanden")}</KeyValue>
          <KeyValue k={tr("Amount", "Betrag")} tone="priv">{tr("absent on-chain", "on-chain nicht vorhanden")}</KeyValue>
          <KeyValue k="Nullifier" tone="mono">{tr("published", "veröffentlicht")}</KeyValue>
          <KeyValue k={tr("ASP inclusion", "ASP-Zugehörigkeit")} tone="pub">{tr("proven clean", "sauber bewiesen")}</KeyValue>
        </div>
        <div className="note">
          {tr(
            "The recipient (e.g. a PSP / settlement address) receives a payment note. Amount + counterparty are known only to the settlement broker — never to the chain.",
            "Der Empfänger (z. B. eine PSP-/Settlement-Adresse) erhält eine Zahlungs-Notiz. Betrag + Gegenpartei kennt nur der Settlement-Broker — nie die Chain.",
          )}
        </div>
      </Card>
    </div>
  );
}

// ---------- Batch ----------
// Build batch rows from a matrix of cells. Core columns: address, role, amount,
// chain. Optional Kontierung columns (any of, case-insensitive + German aliases):
// costcenter/kostenstelle, glaccount/sachkonto, project/projekt, postingdate/
// buchungsdatum, taxcode/steuerschlüssel. Tolerant of quotes/whitespace.
// Both CSV and Excel (.xlsx) imports funnel through here.
function rowsFromMatrix(matrix: (string | number)[][]): BatchRow[] {
  const grid = matrix.map((r) => r.map((c) => String(c ?? "").trim())).filter((r) => r.some((c) => c));
  if (!grid.length) return [];
  const header = grid[0].map((h) => h.toLowerCase().replace(/[\s_-]/g, ""));
  // first header index matching any alias
  const idxOf = (...names: string[]) => header.findIndex((h) => names.includes(h));
  const idx = (name: string) => idxOf(name);
  const hasHeader = idx("address") !== -1 || idx("amount") !== -1;
  const body = hasHeader ? grid.slice(1) : grid;
  const col = {
    address: idx("address"),
    role: idx("role"),
    amount: idx("amount"),
    chain: idx("chain"),
    costCenter: idxOf("costcenter", "kostenstelle", "cc"),
    glAccount: idxOf("glaccount", "gl", "sachkonto", "account", "konto"),
    project: idxOf("project", "projekt", "order", "innenauftrag"),
    postingDate: idxOf("postingdate", "buchungsdatum", "date", "datum"),
    taxCode: idxOf("taxcode", "tax", "steuerschlüssel", "steuerschluessel", "steuer"),
  };
  return body.map((c) => {
    const at = (i: number, fallback: number) => c[i >= 0 ? i : fallback] ?? "";
    const opt = (i: number) => (i >= 0 ? (c[i] ?? "").trim() : "");
    const amount = at(col.amount, 2);
    const accounting: Accounting = {};
    if (opt(col.costCenter)) accounting.costCenter = opt(col.costCenter);
    if (opt(col.glAccount)) accounting.glAccount = opt(col.glAccount);
    if (opt(col.project)) accounting.project = opt(col.project);
    if (opt(col.postingDate)) accounting.postingDate = opt(col.postingDate);
    if (opt(col.taxCode)) accounting.taxCode = opt(col.taxCode);
    return {
      address: at(col.address, 0) || "0x…",
      role: at(col.role, 1) || "—",
      amount: /[a-z]/i.test(amount) ? amount : `${amount} USDC`,
      chain: at(col.chain, 3) || "Base",
      sanctions: "ok" as const,
      ...(Object.keys(accounting).length ? { accounting } : {}),
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
  const tr = useT();
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [lines, setLines] = useState<ProofStep[]>([]);
  const [progress, setProgress] = useState<number | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [screened, setScreened] = useState<string | null>(null);
  const [importErr, setImportErr] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const totalNum = rows.reduce((s, r) => s + amountNumber(r.amount), 0);
  const asset = rows[0]?.amount.split(" ")[1] || "USDC";
  const total = `${totalNum.toLocaleString("en-US")} ${asset}`;
  const hasCoding = rows.some((r) => r.accounting && Object.keys(r.accounting).length > 0);

  async function importFile(file?: File) {
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
      else setImportErr(tr("No rows found. Expected columns: address, role, amount, chain.", "Keine Zeilen gefunden. Erwartete Spalten: address, role, amount, chain."));
    } catch {
      setImportErr(tr("Could not read that file. Use a CSV or .xlsx with columns: address, role, amount, chain.", "Datei konnte nicht gelesen werden. CSV oder .xlsx mit Spalten address, role, amount, chain verwenden."));
    }
  }
  function onImport(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    importFile(f);
  }

  async function downloadTemplate() {
    const { downloadCsv } = await import("../lib/exporters");
    downloadCsv("cloister-batch-template.csv", [
      ["address", "role", "amount", "chain", "costcenter", "glaccount", "project", "postingdate"],
      ["0xRecipientAddress…", "Employee — Jane Doe", "2400", "Polygon", "4000", "6200", "P-0001", "2026-06-30"],
      ["0xRecipientAddress…", "Contractor — Acme Ltd", "1150", "Base", "3000", "6300", "P-2026-A", "2026-06-30"],
      ["0xRecipientAddress…", "Reimbursement — travel", "380", "Arbitrum", "2000", "6800", "", "2026-06-30"],
    ]);
  }

  function screenAll() {
    const clear = rows.filter((r) => r.sanctions === "ok").length;
    const flagged = rows.length - clear;
    setScreened(tr(
      `${rows.length} recipients screened (PoC sanctions list) · ${clear} clear${flagged ? ` · ${flagged} flagged` : ""}`,
      `${rows.length} Empfänger geprüft (PoC-Sanktionsliste) · ${clear} sauber${flagged ? ` · ${flagged} markiert` : ""}`,
    ));
  }

  async function run() {
    // maker-checker: batches at/above the threshold need a second approver (when enabled)
    if (getRequireApproval() && totalNum >= getApprovalThreshold()) {
      setBusy(true);
      try {
        await api.requestApproval({ kind: "batch", summary: tr(`${rows.length} recipients`, `${rows.length} Empfänger`), amount: total, chain: rows[0]?.chain, batch: { rows } });
        setLines([{ progress: 100, html: `<span class='ok'>${tr("submitted for dual approval — see <b>Approvals</b>.", "zur Zweit-Freigabe eingereicht — siehe <b>Freigaben</b>.")}</span>` }]);
        toast(tr("Batch submitted for approval — needs a second approver", "Sammelauszahlung zur Freigabe eingereicht — braucht einen Zweit-Freigeber"), "info");
      } catch (e) {
        toast(e instanceof Error ? e.message : tr("Could not submit", "Konnte nicht einreichen"), "error");
      } finally {
        setBusy(false);
      }
      return;
    }
    setBusy(true);
    setProgress(0);
    setLines([{ progress: 0, html: "starting private batch…" }]);
    try {
      await api.disburseBatch({ rows }, (s) => {
        setProgress(s.progress);
        setLines((prev) => [...prev, s]);
      });
      toast(tr(`Batch of ${rows.length} sent privately`, `Sammelauszahlung mit ${rows.length} privat gesendet`), "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : tr("Batch failed", "Sammelauszahlung fehlgeschlagen"), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="split" style={{ marginTop: 22 }}>
      <Card
        style={{ gridColumn: "1 / -1" }}
        className={drag ? "drag" : ""}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={(e) => { if (e.currentTarget === e.target) setDrag(false); }}
        onDrop={(e) => { e.preventDefault(); setDrag(false); importFile(e.dataTransfer.files?.[0]); }}
      >
        <div className="clab" style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
          {tr("BATCH PAYOUT", "SAMMELAUSZAHLUNG")}
          {rows.length > 0 ? (
            <span style={{ display: "inline-flex", gap: 14 }}>
              <button className="reveal-btn" onClick={downloadTemplate}>{tr("template", "Vorlage")}</button>
              <button className="reveal-btn" onClick={() => fileRef.current?.click()}>{tr("import another", "weitere importieren")}</button>
            </span>
          ) : null}
        </div>
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,text/csv" onChange={onImport} style={{ display: "none" }} />
        {importErr ? <div className="note" style={{ color: "var(--bad)" }}>{importErr}</div> : null}

        {rows.length === 0 ? (
          <div className="dropzone" onClick={() => fileRef.current?.click()} role="button" tabIndex={0}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileRef.current?.click()}>
            <div className="dz-ic">{UPLOAD_ICON}</div>
            <div className="dz-t">{tr("Drop a CSV or Excel file to build the batch", "CSV- oder Excel-Datei ablegen, um die Sammelauszahlung zu erstellen")}</div>
            <div className="dz-s">
              {tr("Columns:", "Spalten:")} <span className="mono">address, role, amount, chain</span>{" "}
              {tr("— plus optional", "— plus optional")} <span className="mono">costcenter, glaccount, project, postingdate</span>{" "}
              {tr("for cost accounting. Ideal for payroll, vendor & contractor payouts, reimbursements and dividends.", "zur Kontierung. Ideal für Gehälter, Lieferanten- & Auftragnehmer-Zahlungen, Spesen und Dividenden.")}
            </div>
            <div className="dz-actions">
              <Button sm variant="solid" onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}>{tr("Choose file", "Datei wählen")}</Button>
              <button className="dz-link" onClick={(e) => { e.stopPropagation(); downloadTemplate(); }}>{tr("Download template", "Vorlage herunterladen")}</button>
            </div>
          </div>
        ) : (
          <>
            <div className="table-scroll">
              <table style={{ marginTop: 10 }}>
                <thead>
                  <tr>
                    <th>{tr("Recipient", "Empfänger")}</th>
                    <th>{tr("Role", "Rolle")}</th>
                    <th>{tr("Amount", "Betrag")}</th>
                    <th>{tr("Chain", "Chain")}</th>
                    {hasCoding ? <th>{tr("Coding", "Kontierung")}</th> : null}
                    <th>{tr("Sanctions", "Sanktionen")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={`${r.address}-${i}`}>
                      <td className="addr mono">{r.address}</td>
                      <td>{r.role}</td>
                      <td className="addr">{r.amount}</td>
                      <td>{r.chain}</td>
                      {hasCoding ? <td className="mono" style={{ fontSize: 12 }}>{codingLabel(r.accounting)}</td> : null}
                      <td><SanctionsTag level={r.sanctions} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid g4" style={{ marginTop: 20 }}>
              <div><div className="clab">{tr("RECIPIENTS", "EMPFÄNGER")}</div><div className="big" style={{ fontSize: 24 }}>{rows.length}</div></div>
              <div><div className="clab">{tr("TOTAL", "GESAMT")}</div><div className="big" style={{ fontSize: 24 }}>{total}</div></div>
              <div><div className="clab">{tr("SETTLEMENT", "ABWICKLUNG")}</div><div className="big" style={{ fontSize: 24 }}>{rows.length} tx</div><div className="cfoot">{tr("independent lanes", "unabhängige Lanes")}</div></div>
              <div><div className="clab">{tr("PROOF", "BEWEIS")}</div><div className="big" style={{ fontSize: 24 }}>{tr("per-tx", "pro Tx")}</div><div className="cfoot">{tr("background", "im Hintergrund")}</div></div>
            </div>
            <div className="actions">
              <Button variant="solid" arrow onClick={run} disabled={busy}>{busy ? tr("Running…", "Läuft…") : tr("Run private batch", "Private Sammelauszahlung starten")}</Button>
              <Button onClick={screenAll}>{tr("Screen all recipients", "Alle Empfänger prüfen")}</Button>
            </div>
            {screened ? <div className="note" style={{ color: "var(--ok)" }}>{screened}</div> : null}
            {lines.length ? <ProofConsole lines={lines} progress={progress} idle="" /> : null}
          </>
        )}
      </Card>
    </div>
  );
}

// ---------- Recurring ----------
function RecurringMode() {
  const api = useApi();
  const tr = useT();
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
        <div className="clab">{tr("PAYROLL — RECURRING", "GEHALT — WIEDERKEHREND")}</div>
        <div className="grid g2">
          <Field label={tr("SCHEDULE", "TURNUS")}>
            <select className="input" value={schedule} onChange={(e) => setSchedule(e.target.value)}>
              <option>{tr("Monthly · 1st", "Monatlich · 1.")}</option>
              <option>{tr("Bi-weekly", "Zweiwöchentlich")}</option>
              <option>{tr("Weekly", "Wöchentlich")}</option>
            </select>
          </Field>
          <Field label={tr("BUDGET CAP", "BUDGET-OBERGRENZE")}>
            <input className="input" value={budgetCap} onChange={(e) => setBudgetCap(e.target.value)} />
          </Field>
        </div>
        <Field label={tr("SPENDING SESSION", "AUSGABE-SESSION")}>
          <div className="gatebox">
            <div className="gate-row">
              <b>{tr("Session key", "Session-Key")}</b> · {tr("authorise up to the budget cap, re-confirm each period", "bis zur Budget-Obergrenze autorisieren, jede Periode neu bestätigen")}
            </div>
            <div className="gate-row">
              <b>{tr("Recorded on device", "Auf dem Gerät erfasst")}</b> · {tr("cap + schedule tracked locally (PoC) — circuit-bound enforcement on the roadmap", "Obergrenze + Turnus lokal gespeichert (PoC) — Circuit-gebundene Durchsetzung auf der Roadmap")}
            </div>
            <div className="gate-row">
              <b>{tr("Near-instant", "Nahezu sofort")}</b> · {tr("subsequent payouts skip re-auth", "Folge-Auszahlungen ohne erneute Freigabe")}
            </div>
          </div>
        </Field>
        <div className="actions">
          <Button variant="solid" arrow onClick={authorize} disabled={busy || authorized}>
            {authorized ? tr("Session authorised", "Session autorisiert") : busy ? tr("Authorising…", "Autorisiere…") : tr("Authorise payroll session", "Gehalts-Session autorisieren")}
          </Button>
        </div>
        <div className="note">
          {tr(
            "Programmatic/oracle payouts use the same session model via API — pre-authorised, rate-limited, fully auditable.",
            "Programmatische/Oracle-Auszahlungen nutzen dasselbe Session-Modell per API — vorautorisiert, ratenbegrenzt, vollständig prüfbar.",
          )}
        </div>
      </Card>
      <Card>
        <div className="clab">{tr("NEXT RUN", "NÄCHSTER LAUF")}</div>
        <div className="big" style={{ fontSize: 24, marginTop: 14 }}>
          {ps?.nextRun ?? "—"}
        </div>
        <div className="cfoot">
          {ps ? tr(`${ps.recipients} recipients · ${ps.amount}`, `${ps.recipients} Empfänger · ${ps.amount}`) : "—"}
        </div>
        <div className="kv" style={{ marginTop: 18 }}>
          <span className="k">{tr("Last run", "Letzter Lauf")}</span>
          <span className="v">{ps?.lastRun ?? "—"}</span>
        </div>
        <div className="kv">
          <span className="k">{tr("Receipts", "Belege")}</span>
          <span className="v">{tr("auto-archived", "auto-archiviert")}</span>
        </div>
      </Card>
    </div>
  );
}
