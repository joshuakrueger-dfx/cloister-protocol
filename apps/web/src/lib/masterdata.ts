// Stammdaten / master data for controlling: cost centers, GL accounts, projects,
// tax codes. Persisted locally per device (a real multi-user backend would host
// these centrally). Drives the Kontierung input suggestions and the accounting
// export mapping. The Stammdaten screen manages these lists.

import { getLang } from "./i18n";
import type { Accounting } from "./types";

export type MdKind = "costCenters" | "glAccounts" | "projects" | "taxCodes";

export interface MdItem {
  code: string;
  name: string;
}

const KEY: Record<MdKind, string> = {
  costCenters: "cloister.md.costCenters",
  glAccounts: "cloister.md.glAccounts",
  projects: "cloister.md.projects",
  taxCodes: "cloister.md.taxCodes",
};

// Seed defaults — recognizable German-finance examples (SKR-style GL ranges,
// standard cost centers, common VAT keys). Used only until a team edits the list.
function seed(kind: MdKind): MdItem[] {
  const de = getLang() === "de";
  switch (kind) {
    case "costCenters":
      return [
        { code: "1000", name: de ? "Geschäftsführung" : "Management" },
        { code: "2000", name: de ? "Vertrieb" : "Sales" },
        { code: "3000", name: de ? "Marketing" : "Marketing" },
        { code: "4000", name: de ? "Personal" : "HR / Personnel" },
        { code: "5000", name: de ? "IT & Technik" : "IT & Engineering" },
        { code: "6000", name: de ? "Finanzen & Controlling" : "Finance & Controlling" },
      ];
    case "glAccounts":
      return [
        { code: "6200", name: de ? "Löhne und Gehälter" : "Wages & salaries" },
        { code: "6300", name: de ? "Fremdleistungen" : "External services" },
        { code: "6600", name: de ? "Werbekosten" : "Advertising" },
        { code: "6800", name: de ? "Reisekosten" : "Travel expenses" },
        { code: "4400", name: de ? "Verbindlichkeiten aus L+L" : "Accounts payable" },
        { code: "6855", name: de ? "Nebenkosten Geldverkehr" : "Bank / transfer fees" },
      ];
    case "projects":
      return [
        { code: "P-0001", name: de ? "Allgemein" : "General" },
        { code: "P-2026-A", name: de ? "Produkt-Launch 2026" : "Product launch 2026" },
      ];
    case "taxCodes":
      return [
        { code: "0", name: de ? "0 % / steuerfrei" : "0% / exempt" },
        { code: "19", name: de ? "19 % Vorsteuer" : "19% input VAT" },
        { code: "7", name: de ? "7 % Vorsteuer" : "7% input VAT" },
      ];
  }
}

export function getMd(kind: MdKind): MdItem[] {
  try {
    const raw = localStorage.getItem(KEY[kind]);
    if (raw) return JSON.parse(raw) as MdItem[];
  } catch {
    /* ignore */
  }
  return seed(kind);
}

export function setMd(kind: MdKind, items: MdItem[]): void {
  try {
    localStorage.setItem(KEY[kind], JSON.stringify(items));
  } catch {
    /* ignore */
  }
}

export function addMd(kind: MdKind, item: MdItem): MdItem[] {
  const items = getMd(kind).filter((i) => i.code !== item.code);
  items.push(item);
  setMd(kind, items);
  return items;
}

export function removeMd(kind: MdKind, code: string): MdItem[] {
  const items = getMd(kind).filter((i) => i.code !== code);
  setMd(kind, items);
  return items;
}

/** Human label for an input <option>/datalist: "1000 · Sales". */
export function mdLabel(i: MdItem): string {
  return i.name ? `${i.code} · ${i.name}` : i.code;
}

/** Compact one-line summary of a payment's coding: "CC 4000 · GL 6200 · P-0001". */
export function codingLabel(a?: Accounting): string {
  if (!a) return "—";
  const parts: string[] = [];
  if (a.costCenter) parts.push(`CC ${a.costCenter.split(" · ")[0]}`);
  if (a.glAccount) parts.push(`GL ${a.glAccount.split(" · ")[0]}`);
  if (a.project) parts.push(a.project.split(" · ")[0]);
  if (a.taxCode) parts.push(`§${a.taxCode.split(" · ")[0]}`);
  return parts.join(" · ") || "—";
}
