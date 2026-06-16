// Real KYC/AML name & jurisdiction screening — NOT theatre.
//
// Closes P1-9: the screening no longer relies on a hardcoded ~18-name sample. It loads the
// full OFAC SDN list (+ alternate names) and any configured additional list (e.g. the EU
// consolidated list) at startup, caches it to disk with a TTL, and refreshes periodically.
// The bundled sample remains ONLY as a fail-safe seed so screening is never empty, and the
// active coverage ("sample" vs "full") is reported honestly via `screeningStatus()` so the
// API never claims full screening while degraded.
//
// Document/liveness verification remains the licensed provider's job (DFX/Sumsub); this
// layer is the rule-based AML part (sanctions name match + jurisdiction embargo).

import fs from "node:fs";
import path from "node:path";

// OFAC "comprehensive sanctions" jurisdictions (programs: CUBA, IRAN, DPRK, SYRIA).
export const EMBARGOED_JURISDICTIONS = {
  CU: "Cuba",
  IR: "Iran",
  KP: "North Korea (DPRK)",
  SY: "Syria",
};

// Bundled fail-safe seed — a real sample of publicly-listed SDN/EU primary names (US/EU
// government data, public domain). Used ONLY until the full lists load (or if every source
// is unreachable), so screening is never empty. Coverage in this state = "sample".
export const SANCTIONS_NAMES = [
  "Vladimir Putin", "Ramzan Kadyrov", "Nicolas Maduro Moros", "Kim Jong Un",
  "Bashar Al-Assad", "Alexander Lukashenko", "Viktor Yanukovych", "Yevgeniy Prigozhin",
  "Konstantin Malofeyev", "Denis Pushilin", "Sergei Shoigu", "Igor Sechin",
  "Wagner Group", "Islamic Revolutionary Guard Corps", "Hizballah", "Lazarus Group",
  "Bank Rossiya", "Tornado Cash", "Garantex", "Hydra Market",
];

export function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // diacritics
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------- CSV parsing (quote-aware, handles commas/newlines/"" inside fields) ----------
export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false;
      } else field += c;
      continue;
    }
    if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\r") { /* skip */ }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const isReal = (v) => v && v !== "-0-" && v.trim() !== "";

// OFAC sdn.csv: cols (no header) ent_num, SDN_Name(1), SDN_Type, Program, ...
export function parseSdnCsv(text) {
  return parseCsv(text).map((r) => r[1]).filter(isReal).map((s) => s.trim());
}
// OFAC alt.csv: cols ent_num, alt_num, alt_type, alt_name(3), alt_remarks
export function parseAltCsv(text) {
  return parseCsv(text).map((r) => r[3]).filter(isReal).map((s) => s.trim());
}

const DEFAULT_SOURCES = [
  { id: "ofac-sdn", url: "https://www.treasury.gov/ofac/downloads/sdn.csv", parse: parseSdnCsv },
  { id: "ofac-alt", url: "https://www.treasury.gov/ofac/downloads/alt.csv", parse: parseAltCsv },
  // EU consolidated list needs a tokenised URL → configure via SANCTIONS_EU_CSV_URL (parsed as
  // generic CSV, name column configurable with SANCTIONS_EU_NAME_COL, default last column).
];

// ---------- active index ----------
export function buildIndex(names, source) {
  const exact = new Set();
  const multi = [];
  for (const raw of names) {
    const n = normalize(raw);
    if (!n) continue;
    exact.add(n);
    const tokens = n.split(" ").filter(Boolean);
    if (tokens.length >= 2) multi.push({ display: raw, tokens });
  }
  return { exact, multi, count: exact.size, source, loadedAt: new Date().toISOString() };
}

let activeIndex = buildIndex(SANCTIONS_NAMES, "bundled-sample");

export function screeningStatus() {
  return {
    mode: activeIndex.source.startsWith("bundled") ? "sample" : "full",
    count: activeIndex.count,
    source: activeIndex.source,
    loadedAt: activeIndex.loadedAt,
  };
}

// Conservative match: exact (normalized) OR every token of a list entry appears in the name
// ("Putin, Vladimir" matches "Vladimir Vladimirovich Putin"). AML principle: flag rather than
// pass. Matches against the currently-loaded index (full list when loaded, else sample).
export function matchName(name, index = activeIndex) {
  const n = normalize(name);
  if (!n) return null;
  if (index.exact.has(n)) return { match: name, score: 1.0 };
  const tokens = new Set(n.split(" ").filter(Boolean));
  for (const e of index.multi) {
    if (e.tokens.every((t) => tokens.has(t))) return { match: e.display, score: 0.9 };
  }
  return null;
}

// ---------- full-list loader (network + disk cache + graceful degradation) ----------
export async function loadFullSdn(opts = {}) {
  const {
    sources = DEFAULT_SOURCES,
    cacheDir = process.env.SANCTIONS_CACHE_DIR || path.join(process.cwd(), ".sanctions-cache"),
    ttlMs = Number(process.env.SANCTIONS_TTL_MS) || 24 * 60 * 60 * 1000,
    fetchImpl = globalThis.fetch,
    log = console,
  } = opts;

  // optional EU/extra CSV source via env
  const euUrl = process.env.SANCTIONS_EU_CSV_URL;
  const allSources = euUrl
    ? [...sources, { id: "eu-consolidated", url: euUrl, parse: makeGenericCsvParser(process.env.SANCTIONS_EU_NAME_COL) }]
    : sources;

  const cacheFile = path.join(cacheDir, "sanctions-cache.json");

  // 1. fresh disk cache?
  try {
    const stat = fs.statSync(cacheFile);
    if (Date.now() - stat.mtimeMs < ttlMs) {
      const cached = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
      if (Array.isArray(cached.names) && cached.names.length) {
        activeIndex = buildIndex(cached.names, `cache(${cached.source || "mixed"})`);
        return screeningStatus();
      }
    }
  } catch { /* no/invalid cache → fetch */ }

  // 2. fetch live
  const names = [];
  const used = [];
  for (const s of allSources) {
    try {
      const res = await fetchImpl(s.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const parsed = s.parse(await res.text());
      if (parsed.length) { names.push(...parsed); used.push(`${s.id}:${parsed.length}`); }
    } catch (e) {
      log.warn?.(`sanctions: source ${s.id} failed: ${e.message}`);
    }
  }

  if (!names.length) {
    log.warn?.("sanctions: all sources failed — staying on bundled SAMPLE (DEGRADED screening)");
    return screeningStatus();
  }

  const uniq = [...new Set(names.map((x) => x.trim()).filter(Boolean))];
  activeIndex = buildIndex(uniq, `live(${used.join(",")})`);
  try {
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify({ savedAt: new Date().toISOString(), source: used.join(","), names: uniq }));
  } catch (e) {
    log.warn?.(`sanctions: cache write failed: ${e.message}`);
  }
  return screeningStatus();
}

function makeGenericCsvParser(nameCol) {
  return (text) => {
    const rows = parseCsv(text);
    if (!rows.length) return [];
    const col = nameCol != null && nameCol !== "" ? Number(nameCol) : rows[0].length - 1;
    return rows.map((r) => r[col]).filter(isReal).map((s) => s.trim());
  };
}

// Screens an applicant. Returns status + per-check detail. The sanctions check detail names
// the active coverage so a "verified" result on degraded (sample) screening is never silent.
export function screenApplicant(applicant = {}) {
  const { subjectType = "individual", legalName, country, idType, idNumber, dateOfBirth } = applicant;
  const checks = [];

  const fieldsOk = Boolean(legalName && country && idType && idNumber && (subjectType === "entity" || dateOfBirth));
  checks.push({ name: "Required fields", pass: fieldsOk, detail: fieldsOk ? "complete" : "missing required identity fields" });

  let age = null;
  if (dateOfBirth) {
    const d = new Date(dateOfBirth);
    if (!isNaN(d.getTime())) age = Math.floor((Date.now() - d.getTime()) / 3.15576e10);
  }
  const ageOk = subjectType === "entity" || (age !== null && age >= 18 && age < 120);
  checks.push({
    name: "Age / validity",
    pass: ageOk,
    detail: subjectType === "entity" ? "legal entity (DOB n/a)" : age !== null ? `age ${age}` : "invalid date of birth",
  });

  const cc = String(country || "").toUpperCase();
  const embargoed = Boolean(EMBARGOED_JURISDICTIONS[cc]);
  checks.push({
    name: "Jurisdiction screening",
    pass: !embargoed,
    detail: embargoed ? `embargoed jurisdiction: ${EMBARGOED_JURISDICTIONS[cc]}` : `${cc || "—"} permitted`,
  });

  const st = screeningStatus();
  const hit = matchName(legalName);
  checks.push({
    name: "Sanctions screening (OFAC SDN / EU)",
    pass: !hit,
    detail: hit
      ? `potential match: "${hit.match}" — referred for review`
      : `no match · ${st.mode} list (${st.count} names · ${st.source})`,
  });

  const status = checks.every((c) => c.pass) ? "verified" : "rejected";
  return { status, checks, screening: st };
}
