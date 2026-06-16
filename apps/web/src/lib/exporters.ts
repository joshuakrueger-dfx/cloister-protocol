// File export in the formats the user picks: PDF (human-readable, jsPDF), CSV
// (opens natively in Excel / Google Sheets) and JSON (signed, machine-readable
// attestation). Every visual document is brand-stamped — Cloister mark + wordmark
// in the brand palette, plus a branded footer — so anything the app produces is
// unmistakably a Cloister document.

import { jsPDF } from "jspdf";

// ---- brand palette (monochrome, print-friendly on white paper) ----
const INK: [number, number, number] = [14, 15, 18];     // near-black brand ink
const MUTE: [number, number, number] = [120, 125, 135]; // brand grey
const HAIR: [number, number, number] = [219, 221, 226]; // hairline
const BRAND_NAME = "Cloister Protocol";
const BRAND_URL = "cloister-protocol.com";

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadJson(filename: string, obj: unknown) {
  // brand-stamp machine-readable exports too (name + origin), without disturbing payload
  const wrapped = {
    _generator: { name: BRAND_NAME, url: `https://${BRAND_URL}`, generatedAt: new Date().toISOString() },
    ...(obj && typeof obj === "object" ? (obj as Record<string, unknown>) : { data: obj }),
  };
  triggerDownload(new Blob([JSON.stringify(wrapped, null, 2)], { type: "application/json" }), filename);
}

// CSV with RFC-4180 quoting (opens in Excel + Google Sheets). rows[0] = header.
export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map((r) => r.map(esc).join(",")).join("\r\n");
  triggerDownload(new Blob([csv], { type: "text/csv;charset=utf-8" }), filename);
}

// The Cloister mark "●—◯—●" drawn as vectors, so it stays crisp at any scale.
function drawMark(pdf: jsPDF, x: number, cy: number, scale = 1) {
  const r = 3.6 * scale;
  pdf.setFillColor(...INK);
  pdf.setDrawColor(...INK);
  pdf.circle(x, cy, r, "F");                                  // sender node ●
  pdf.rect(x + r + 2 * scale, cy - 1.1 * scale, 7 * scale, 2.2 * scale, "F"); // bar
  const ringX = x + r + 9 * scale + r;
  pdf.setLineWidth(1.5 * scale);
  pdf.circle(ringX, cy, r, "S");                              // shield ◯
  pdf.rect(ringX + r + 2 * scale, cy - 1.1 * scale, 7 * scale, 2.2 * scale, "F"); // bar
  const lastX = ringX + r + 9 * scale + r;
  pdf.circle(lastX, cy, r, "F");                             // recipient node ●
  return lastX + r; // right edge
}

function brandHeader(pdf: jsPDF, M: number, W: number): number {
  const cy = M + 4;
  const markRight = drawMark(pdf, M + 4, cy);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(...INK);
  pdf.text("CLOISTER", markRight + 12, cy + 3.4, { charSpace: 1.2 });
  const cloisterW = pdf.getTextWidth("CLOISTER") + 8;
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(...MUTE);
  pdf.text("PROTOCOL", markRight + 12 + cloisterW + 4, cy + 3.4, { charSpace: 1.2 });
  // hairline under the brand band
  pdf.setDrawColor(...HAIR);
  pdf.setLineWidth(0.6);
  pdf.line(M, M + 18, W - M, M + 18);
  return M + 40; // content start y
}

function brandFooter(pdf: jsPDF, M: number, W: number, H: number) {
  const total = pdf.getNumberOfPages();
  const stamp = new Date().toISOString().slice(0, 10);
  for (let p = 1; p <= total; p++) {
    pdf.setPage(p);
    pdf.setDrawColor(...HAIR);
    pdf.setLineWidth(0.6);
    pdf.line(M, H - 34, W - M, H - 34);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.setTextColor(...MUTE);
    pdf.text(`${BRAND_NAME} · ${BRAND_URL} · generated ${stamp}`, M, H - 22);
    pdf.text(`Page ${p} / ${total}`, W - M, H - 22, { align: "right" });
  }
}

export interface PdfDoc {
  title: string;
  subtitle?: string;
  fields?: Array<[string, string]>;
  table?: { headers: string[]; rows: (string | number)[][] };
  footer?: string;
}

export function downloadPdf(filename: string, doc: PdfDoc) {
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const M = 48;
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  let y = brandHeader(pdf, M, W);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.setTextColor(...INK);
  pdf.text(doc.title, M, y);
  y += 22;

  if (doc.subtitle) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(...MUTE);
    const sub = pdf.splitTextToSize(doc.subtitle, W - 2 * M);
    pdf.text(sub, M, y);
    y += 14 * sub.length + 8;
    pdf.setTextColor(...INK);
  }

  pdf.setDrawColor(...HAIR);
  pdf.line(M, y, W - M, y);
  y += 20;

  if (doc.fields) {
    pdf.setFontSize(10.5);
    for (const [k, v] of doc.fields) {
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(...MUTE);
      pdf.text(k, M, y);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(...INK);
      const lines = pdf.splitTextToSize(v, W - 2 * M - 150);
      pdf.text(lines, M + 150, y);
      y += 16 * lines.length + 4;
      if (y > H - 56) { pdf.addPage(); y = brandHeader(pdf, M, W); }
    }
  }

  if (doc.table) {
    y += 8;
    const cols = doc.table.headers.length;
    const colW = (W - 2 * M) / cols;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(...MUTE);
    doc.table.headers.forEach((h, i) => pdf.text(String(h), M + i * colW, y));
    y += 6;
    pdf.setDrawColor(...HAIR);
    pdf.line(M, y, W - M, y);
    y += 14;
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(...INK);
    for (const row of doc.table.rows) {
      row.forEach((c, i) => pdf.text(pdf.splitTextToSize(String(c ?? ""), colW - 6), M + i * colW, y));
      y += 16;
      if (y > H - 56) { pdf.addPage(); y = brandHeader(pdf, M, W); }
    }
  }

  if (doc.footer) {
    if (y > H - 70) { pdf.addPage(); y = brandHeader(pdf, M, W); }
    pdf.setFontSize(8.5);
    pdf.setTextColor(...MUTE);
    pdf.text(pdf.splitTextToSize(doc.footer, W - 2 * M), M, H - 48);
  }

  brandFooter(pdf, M, W, H);
  pdf.save(filename);
}
