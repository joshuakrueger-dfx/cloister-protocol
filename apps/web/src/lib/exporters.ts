// Datei-Export in den vom Nutzer gewählten Formaten: PDF (menschenlesbar, jsPDF),
// CSV (öffnet nativ in Excel / Google Sheets) und JSON (signiertes, maschinenlesbares
// Attestat). Eine Quelle für Compliance-Receipt und Audit-Log.

import { jsPDF } from "jspdf";

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
  triggerDownload(new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" }), filename);
}

// CSV mit RFC-4180-Quoting (öffnet in Excel + Google Sheets). rows[0] = Header.
export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map((r) => r.map(esc).join(",")).join("\r\n");
  triggerDownload(new Blob([csv], { type: "text/csv;charset=utf-8" }), filename);
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
  let y = M;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.text(doc.title, M, y);
  y += 22;

  if (doc.subtitle) {
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(10);
    pdf.setTextColor(110);
    pdf.text(pdf.splitTextToSize(doc.subtitle, W - 2 * M), M, y);
    y += 14 * pdf.splitTextToSize(doc.subtitle, W - 2 * M).length + 8;
    pdf.setTextColor(20);
  }

  pdf.setDrawColor(220);
  pdf.line(M, y, W - M, y);
  y += 20;

  if (doc.fields) {
    pdf.setFontSize(10.5);
    for (const [k, v] of doc.fields) {
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(90);
      pdf.text(k, M, y);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(20);
      const lines = pdf.splitTextToSize(v, W - 2 * M - 150);
      pdf.text(lines, M + 150, y);
      y += 16 * lines.length + 4;
      if (y > pdf.internal.pageSize.getHeight() - M) { pdf.addPage(); y = M; }
    }
  }

  if (doc.table) {
    y += 8;
    const cols = doc.table.headers.length;
    const colW = (W - 2 * M) / cols;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(9);
    pdf.setTextColor(90);
    doc.table.headers.forEach((h, i) => pdf.text(String(h), M + i * colW, y));
    y += 6;
    pdf.line(M, y, W - M, y);
    y += 14;
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(20);
    for (const row of doc.table.rows) {
      row.forEach((c, i) => pdf.text(pdf.splitTextToSize(String(c ?? ""), colW - 6), M + i * colW, y));
      y += 16;
      if (y > pdf.internal.pageSize.getHeight() - M) { pdf.addPage(); y = M; }
    }
  }

  if (doc.footer) {
    pdf.setFontSize(8);
    pdf.setTextColor(140);
    pdf.text(doc.footer, M, pdf.internal.pageSize.getHeight() - 28);
  }

  pdf.save(filename);
}
