// Invoice → payment extraction.
// Reads a PDF's text layer first; if the PDF is a scan (no text) or the upload is
// an image, it renders/loads the pages and runs OCR (tesseract). Then it
// heuristically pulls out the amount, recipient (EVM address or IBAN) and a
// reference, which the user reviews before paying. Both libraries are loaded
// lazily, so they only ship when someone actually uploads an invoice.

import * as pdfjs from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

export interface InvoiceExtract {
  amount?: string; // normalized numeric string, e.g. "1234.56"
  currency?: string; // USDC / EURC / EUR / USD / …
  recipient?: string; // 0x… address or IBAN
  reference?: string; // invoice number / reference
  rawText: string;
  source: "pdf-text" | "ocr";
}

type ProgressFn = (stage: string, p?: number) => void;

function isPdf(file: File): boolean {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

async function pdfText(file: File): Promise<string> {
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  let text = "";
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    text += content.items.map((i) => ("str" in i ? i.str : "")).join(" ") + "\n";
  }
  return text;
}

async function renderPdfPages(file: File, max: number): Promise<Blob[]> {
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const out: Blob[] = [];
  const n = Math.min(max, doc.numPages);
  for (let p = 1; p <= n; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob((b) => res(b), "image/png"));
    if (blob) out.push(blob);
  }
  return out;
}

async function ocr(images: (Blob | File)[], onProgress?: ProgressFn): Promise<string> {
  const { default: Tesseract } = await import("tesseract.js");
  let text = "";
  for (const img of images) {
    const { data } = await Tesseract.recognize(img, "eng", {
      logger: (m: { status: string; progress: number }) => {
        if (m.status === "recognizing text") onProgress?.("OCR", m.progress);
      },
    });
    text += data.text + "\n";
  }
  return text;
}

// "1.234,56" (EU) and "1,234.56" (US) and "1234,56" → a JS number
function normNum(s: string): number {
  let x = s.trim();
  if (x.includes(".") && /,\d{2}$/.test(x)) x = x.replace(/\./g, "").replace(",", ".");
  else if (/,\d{2}$/.test(x)) x = x.replace(",", ".");
  else x = x.replace(/,/g, "");
  return Number(x) || 0;
}

function parseFields(text: string): Omit<InvoiceExtract, "rawText" | "source"> {
  const t = text.replace(/ /g, " ");
  const evm = t.match(/0x[a-fA-F0-9]{40}/);
  const iban = t.match(/\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]){10,30}\b/);
  const recipient = evm?.[0] || (iban ? iban[0].replace(/\s+/g, "") : undefined);
  const currency = (t.match(/\b(USDC|EURC|EUR|USD|CHF|GBP)\b/) || [])[1];
  const NUM = "([0-9][0-9.,]*[0-9]|[0-9])";
  const labelled = t.match(
    new RegExp(
      "(?:total\\s*(?:due|amount)?|amount\\s*due|grand\\s*total|balance\\s*due|gesamt(?:betrag)?|zu\\s*zahlen|rechnungsbetrag|summe)\\D{0,25}" +
        NUM,
      "i",
    ),
  );
  let amount = labelled?.[1];
  if (!amount) {
    const cands = [...t.matchAll(/[0-9][0-9.,]{2,}/g)].map((m) => m[0]);
    amount = cands.sort((a, b) => normNum(b) - normNum(a))[0];
  }
  // label (invoice/rechnung/ref) + optional "no./nr./number/#" then the id.
  // Require the captured id to contain a digit so we don't grab plain words.
  let reference: string | undefined = (text.match(
    /(?:invoice|rechnung|ref(?:erence)?)\s*(?:no\.?|nr\.?|number|#)?\s*[:.#]?\s*([A-Z0-9][A-Z0-9\-/]{3,})/i,
  ) || [])[1];
  if (reference && !/\d/.test(reference)) reference = undefined;
  return {
    amount: amount ? String(normNum(amount)) : undefined,
    currency,
    recipient,
    reference,
  };
}

export async function extractInvoice(file: File, onProgress?: ProgressFn): Promise<InvoiceExtract> {
  if (isPdf(file)) {
    onProgress?.("reading PDF");
    const text = await pdfText(file);
    if (text.replace(/\s/g, "").length > 40) {
      return { ...parseFields(text), rawText: text, source: "pdf-text" };
    }
    onProgress?.("scanned PDF — running OCR");
    const imgs = await renderPdfPages(file, 3);
    const txt = await ocr(imgs, onProgress);
    return { ...parseFields(txt), rawText: txt, source: "ocr" };
  }
  onProgress?.("running OCR");
  const txt = await ocr([file], onProgress);
  return { ...parseFields(txt), rawText: txt, source: "ocr" };
}
