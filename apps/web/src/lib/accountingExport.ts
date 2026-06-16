// Accounting / ERP exports built from the decrypted ledger (Disbursement[] with
// Kontierung). Three formats finance teams already use:
//   • DATEV  — Buchungsstapel CSV (German bookkeeping standard, SKR-style)
//   • CSV    — generic / SAP-style flat file with every coding column
//   • SEPA   — pain.001.001.09 ISO 20022 credit-transfer XML
// All run client-side from data already in memory — no extra backend round-trip.

import type { Disbursement } from "./types";
import { downloadCsv } from "./exporters";

// Clearing account every payment is booked against (the on-chain settlement /
// bank-transit account). A placeholder a controller remaps to their chart of
// accounts (SKR03 Bank 1200 · SKR04 Bank 1800 · Geldtransit 1360/1460).
const CLEARING_ACCOUNT = "1360";

export interface ParsedAmount {
  value: number; // numeric magnitude
  currency: string; // token / currency code, e.g. USDC, EURC
}

// "12,500 USDC" / "340 EURC" → { value, currency }. Tolerant of thousands commas.
export function parseAmount(a: string): ParsedAmount {
  const [numPart, ...rest] = a.trim().split(/\s+/);
  const value = Number(numPart.replace(/[, ]/g, "")) || 0;
  return { value, currency: (rest[0] || "USDC").toUpperCase() };
}

// Token → ISO-ish currency for ledger/WKZ fields (stablecoins track fiat 1:1).
function isoCurrency(token: string): string {
  if (token.startsWith("EUR")) return "EUR";
  if (token.startsWith("USD") || token === "USDC" || token === "USDT") return "USD";
  return token;
}

// yyyy-mm-dd (or a label like "Jun 16") → DD.MM.YYYY for German bookkeeping.
function datevDate(iso: string | undefined, fallbackYear = 2026): string {
  if (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-");
    return `${d}.${m}.${y}`;
  }
  // best-effort for "Jun 16" style labels
  const m = (iso || "").match(/^([A-Za-z]{3})\s+(\d{1,2})$/);
  if (m) {
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const mm = String(months.indexOf(m[1].toLowerCase()) + 1).padStart(2, "0");
    return `${m[2].padStart(2, "0")}.${mm}.${fallbackYear}`;
  }
  return iso || "";
}

// Strip a "1234 · Label" master-data value down to the bare code "1234".
function code(v: string | undefined): string {
  return (v || "").split(" · ")[0].trim();
}

// ---------- DATEV Buchungsstapel (CSV) ----------
// One debit booking per payment: expense GL account (Soll) against the clearing
// account. Column names match the DATEV import assistant ("Buchungsstapel").
export function exportDatev(rows: Disbursement[], period: string) {
  const header = [
    "Umsatz (ohne Soll/Haben-Kz)",
    "Soll/Haben-Kennzeichen",
    "WKZ Umsatz",
    "Konto",
    "Gegenkonto (ohne BU-Schlüssel)",
    "BU-Schlüssel",
    "Belegdatum",
    "Belegfeld 1",
    "Buchungstext",
    "KOST1 - Kostenstelle",
    "Projekt",
  ];
  const body = rows.map((r) => {
    const amt = parseAmount(r.amount);
    const a = r.accounting || {};
    return [
      amt.value.toFixed(2).replace(".", ","), // DATEV uses comma decimals
      "S", // Soll (expense debit)
      isoCurrency(amt.currency),
      code(a.glAccount) || "", // Konto = Sachkonto
      CLEARING_ACCOUNT, // Gegenkonto = clearing
      code(a.taxCode) || "", // BU-Schlüssel (tax key)
      datevDate(a.postingDate || r.date),
      r.id.slice(0, 36), // Belegfeld 1 = document/tx reference
      `${r.recipient} · ${r.purpose}`.slice(0, 60), // Buchungstext
      code(a.costCenter) || "",
      code(a.project) || "",
    ];
  });
  downloadCsv(`cloister-datev-${slug(period)}.csv`, [header, ...body]);
}

// ---------- Generic / SAP-style CSV ----------
// Flat file with every column, for SAP, Excel pivots, or a custom ERP importer.
export function exportAccountingCsv(rows: Disbursement[], period: string) {
  const header = [
    "Date", "Posting date", "Recipient", "Purpose", "Amount", "Currency",
    "Cost center", "GL account", "Project", "Tax code", "Chain", "Compliance", "Status", "Reference",
  ];
  const body = rows.map((r) => {
    const amt = parseAmount(r.amount);
    const a = r.accounting || {};
    return [
      r.date, a.postingDate || "", r.recipient, r.purpose,
      amt.value.toFixed(2), amt.currency,
      code(a.costCenter), code(a.glAccount), code(a.project), code(a.taxCode),
      r.chain, r.compliance, r.status, r.id,
    ];
  });
  downloadCsv(`cloister-accounting-${slug(period)}.csv`, [header, ...body]);
}

// ---------- SEPA pain.001.001.09 (ISO 20022 credit transfer) ----------
// Generates a structurally-valid Customer Credit Transfer Initiation file for the
// EUR-denominated payments. Where a recipient is an IBAN (e.g. an invoice-extracted
// fiat leg) it is used directly; on-chain addresses go into the remittance info.
export interface SepaParams {
  debtorName: string;
  debtorIban?: string;
  msgId: string; // caller supplies (no Date.now in shared code paths)
  createdAt: string; // ISO datetime
}

const IBAN_RE = /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/;

export function buildSepaXml(rows: Disbursement[], p: SepaParams): { xml: string; included: number; skipped: number } {
  const eur = rows.filter((r) => isoCurrency(parseAmount(r.amount).currency) === "EUR");
  const skipped = rows.length - eur.length;
  const x = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c] as string));
  const sum = eur.reduce((s, r) => s + parseAmount(r.amount).value, 0).toFixed(2);
  const dt = p.createdAt;
  const reqDate = dt.slice(0, 10);

  const tx = eur
    .map((r) => {
      const amt = parseAmount(r.amount).value.toFixed(2);
      const rcptIsIban = IBAN_RE.test(r.recipient.replace(/\s/g, "").toUpperCase());
      const iban = rcptIsIban ? r.recipient.replace(/\s/g, "").toUpperCase() : "";
      const rmt = rcptIsIban ? `${r.purpose}` : `${r.purpose} · ${r.recipient}`;
      return [
        "      <CdtTrfTxInf>",
        `        <PmtId><EndToEndId>${x(r.id.slice(0, 35))}</EndToEndId></PmtId>`,
        `        <Amt><InstdAmt Ccy="EUR">${amt}</InstdAmt></Amt>`,
        `        <Cdtr><Nm>${x(r.recipient.slice(0, 70))}</Nm></Cdtr>`,
        iban ? `        <CdtrAcct><Id><IBAN>${iban}</IBAN></Id></CdtrAcct>` : `        <CdtrAcct><Id><Othr><Id>${x(r.recipient.slice(0, 34))}</Id></Othr></Id></CdtrAcct>`,
        `        <RmtInf><Ustrd>${x(rmt.slice(0, 140))}</Ustrd></RmtInf>`,
        "      </CdtTrfTxInf>",
      ].join("\n");
    })
    .join("\n");

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.09">',
    "  <CstmrCdtTrfInitn>",
    "    <GrpHdr>",
    `      <MsgId>${x(p.msgId)}</MsgId>`,
    `      <CreDtTm>${x(dt)}</CreDtTm>`,
    `      <NbOfTxs>${eur.length}</NbOfTxs>`,
    `      <CtrlSum>${sum}</CtrlSum>`,
    `      <InitgPty><Nm>${x(p.debtorName)}</Nm></InitgPty>`,
    "    </GrpHdr>",
    "    <PmtInf>",
    `      <PmtInfId>${x(p.msgId)}-1</PmtInfId>`,
    "      <PmtMtd>TRF</PmtMtd>",
    `      <NbOfTxs>${eur.length}</NbOfTxs>`,
    `      <CtrlSum>${sum}</CtrlSum>`,
    "      <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf>",
    `      <ReqdExctnDt><Dt>${reqDate}</Dt></ReqdExctnDt>`,
    `      <Dbtr><Nm>${x(p.debtorName)}</Nm></Dbtr>`,
    `      <DbtrAcct><Id>${p.debtorIban ? `<IBAN>${x(p.debtorIban)}</IBAN>` : "<Othr><Id>NOTPROVIDED</Id></Othr>"}</Id></DbtrAcct>`,
    "      <DbtrAgt><FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId></DbtrAgt>",
    tx,
    "    </PmtInf>",
    "  </CstmrCdtTrfInitn>",
    "</Document>",
  ].join("\n");

  return { xml, included: eur.length, skipped };
}

export function exportSepaXml(rows: Disbursement[], p: SepaParams, period: string): { included: number; skipped: number } {
  const { xml, included, skipped } = buildSepaXml(rows, p);
  const blob = new Blob([xml], { type: "application/xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cloister-sepa-${slug(period)}.xml`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return { included, skipped };
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
