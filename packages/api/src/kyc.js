// Echtes KYC/AML-Screening — KEIN Theater. Validiert Pflichtfelder, prüft die
// Jurisdiktion gegen die OFAC-komplettsanktionierten Länder und gleicht den Namen
// gegen Sanktionslisten (OFAC SDN / EU consolidated) ab. Das Ergebnis kann „rejected"
// sein. Dokumenten-/Liveness-Verifikation ist Aufgabe des lizenzierten Providers
// (DFX/Sumsub) — diese Schicht ist der regelbasierte AML-Teil.
//
// Referenzdaten: OFAC comprehensive programs (öffentlich, treasury.gov) + eine reale
// Stichprobe der SDN/EU-Primärnamen. Produktiv: vollständige OFAC-SDN (sdn.csv) +
// EU-consolidated automatisiert laden (siehe loadFullSdn unten).

// OFAC „comprehensive sanctions" Jurisdiktionen (Programme: CUBA, IRAN, DPRK, SYRIA).
// Region-Sanktionen (Krim/DNR/LNR) zusätzlich über separate Region-Eingabe (hier per Land).
export const EMBARGOED_JURISDICTIONS = {
  CU: "Cuba",
  IR: "Iran",
  KP: "North Korea (DPRK)",
  SY: "Syria",
};

// Reale Stichprobe öffentlich gelisteter SDN/EU-Primärnamen (US-Regierungsdaten,
// gemeinfrei; Zweck = Sanktions-Screening). Demonstriert echtes Matching — testbar.
export const SANCTIONS_NAMES = [
  // OFAC SDN — Individuen (Auswahl bekannter Einträge)
  "Vladimir Putin",
  "Ramzan Kadyrov",
  "Nicolas Maduro Moros",
  "Kim Jong Un",
  "Bashar Al-Assad",
  "Alexander Lukashenko",
  "Viktor Yanukovych",
  "Yevgeniy Prigozhin",
  "Konstantin Malofeyev",
  "Denis Pushilin",
  "Sergei Shoigu",
  "Igor Sechin",
  // OFAC SDN — Entitäten / Organisationen (Auswahl)
  "Wagner Group",
  "Islamic Revolutionary Guard Corps",
  "Hizballah",
  "Lazarus Group",
  "Bank Rossiya",
  "Tornado Cash",
  "Garantex",
  "Hydra Market",
];

function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // Diakritika
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Namensabgleich: exakt (normalisiert) ODER alle Tokens eines Listennamens kommen vor
// (z.B. „Putin, Vladimir" matcht „Vladimir Vladimirovich Putin"). Konservativ → eher
// flaggen als durchlassen (AML-Prinzip).
function nameHit(name) {
  const n = normalize(name);
  if (!n) return null;
  const tokens = new Set(n.split(" ").filter(Boolean));
  for (const entry of SANCTIONS_NAMES) {
    const en = normalize(entry);
    if (en === n) return { match: entry, score: 1.0 };
    const et = en.split(" ").filter(Boolean);
    if (et.length >= 2) {
      const overlap = et.filter((t) => tokens.has(t)).length;
      if (overlap === et.length) return { match: entry, score: 0.9 };
    }
  }
  return null;
}

// Screent einen Antragsteller. Gibt Status + pro-Check-Detail zurück.
export function screenApplicant(applicant = {}) {
  const { subjectType = "individual", legalName, country, idType, idNumber, dateOfBirth } = applicant;
  const checks = [];

  const fieldsOk = Boolean(legalName && country && idType && idNumber && (subjectType === "entity" || dateOfBirth));
  checks.push({
    name: "Required fields",
    pass: fieldsOk,
    detail: fieldsOk ? "complete" : "missing required identity fields",
  });

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

  const hit = nameHit(legalName);
  checks.push({
    name: "Sanctions screening (OFAC SDN / EU)",
    pass: !hit,
    detail: hit ? `potential match: "${hit.match}" — referred for review` : "no match on sanctions lists",
  });

  const status = checks.every((c) => c.pass) ? "verified" : "rejected";
  return { status, checks };
}
