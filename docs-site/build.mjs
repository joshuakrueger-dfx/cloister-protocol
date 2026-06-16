// Build the Cloister docs site: render curated Markdown into brand-styled,
// static HTML pages with a GitBook-style sidebar. SEO-friendly (pre-rendered).
// Bilingual: English at the root, German under /de/, with a language switcher.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DOCS = { en: resolve(ROOT, "docs/en"), de: resolve(ROOT, "docs/de") };
const PAGES = { en: resolve(__dirname, "pages"), de: resolve(__dirname, "pages/de") };
const OUT = resolve(__dirname, "dist");
mkdirSync(OUT, { recursive: true });
mkdirSync(resolve(OUT, "de"), { recursive: true });

const LANGS = ["en", "de"];

// ---- curated navigation. Pages come from docs-site/pages/*.md (authored for the
// docs site) or docs/<lang>/*.md (the as-built technical spec). Internal audit/plan
// docs are intentionally excluded. Section + item titles carry both languages. ----
const NAV = [
  { section: { en: "Overview", de: "Überblick" }, items: [
    { slug: "index", title: { en: "Introduction", de: "Einführung" }, page: "introduction" },
    { slug: "how-it-works", title: { en: "How it works", de: "So funktioniert es" }, page: "how-it-works" },
    { slug: "why-cloister", title: { en: "Why Cloister", de: "Warum Cloister" }, page: "why-cloister" },
  ]},
  { section: { en: "Core concepts", de: "Kernkonzepte" }, items: [
    { slug: "concept-pool", title: { en: "The shielded pool", de: "Der abgeschirmte Pool" }, page: "concept-pool" },
    { slug: "concept-shield", title: { en: "Shielding funds", de: "Mittel abschirmen" }, page: "concept-shield" },
    { slug: "concept-pay", title: { en: "Private payments", de: "Private Zahlungen" }, page: "concept-pay" },
    { slug: "concept-association", title: { en: "Association sets & compliance", de: "Association-Sets & Compliance" }, page: "concept-association" },
    { slug: "concept-viewing-keys", title: { en: "Viewing keys & disclosure", de: "Viewing-Keys & Offenlegung" }, page: "concept-viewing-keys" },
    { slug: "concept-keys", title: { en: "Keys & recovery", de: "Schlüssel & Wiederherstellung" }, page: "concept-keys" },
  ]},
  { section: { en: "Protocol", de: "Protokoll" }, items: [
    { slug: "architecture", title: { en: "Architecture", de: "Architektur" }, file: "ARCHITECTURE.md" },
    { slug: "circuit", title: { en: "Circuit specification", de: "Circuit-Spezifikation" }, file: "CIRCUIT.md" },
    { slug: "privacy", title: { en: "Privacy model", de: "Privatsphäre-Modell" }, file: "PRIVACY.md" },
    { slug: "security", title: { en: "Security", de: "Sicherheit" }, file: "SECURITY.md" },
    { slug: "fallbacks", title: { en: "Fallbacks & resilience", de: "Fallbacks & Resilienz" }, file: "FALLBACKS.md" },
  ]},
  { section: { en: "Build", de: "Entwickeln" }, items: [
    { slug: "integration", title: { en: "Integration", de: "Integration" }, file: "INTEGRATION.md" },
    { slug: "smart-contracts", title: { en: "Smart contracts", de: "Smart Contracts" }, page: "smart-contracts" },
    { slug: "deployment", title: { en: "Deployment", de: "Deployment" }, file: "DEPLOYMENT.md" },
    { slug: "validation", title: { en: "Validation", de: "Validierung" }, file: "VALIDATION.md" },
  ]},
  { section: { en: "Resources", de: "Ressourcen" }, items: [
    { slug: "faq", title: { en: "FAQ", de: "FAQ" }, page: "faq" },
    { slug: "glossary", title: { en: "Glossary", de: "Glossar" }, page: "glossary" },
  ]},
  { section: { en: "Legal", de: "Rechtliches" }, items: [
    { slug: "disclaimer", title: { en: "Disclaimer", de: "Haftungsausschluss" }, page: "disclaimer" },
    { slug: "privacy-policy", title: { en: "Privacy policy", de: "Datenschutz" }, page: "privacy-policy" },
    { slug: "imprint", title: { en: "Imprint", de: "Impressum" }, page: "imprint" },
  ]},
];

// localized UI strings
const UI = {
  en: {
    tagline: "DOCS", website: "Website", openApp: "Open App →", onThisPage: "On this page",
    footer: "© 2026 Cloister Protocol · All rights reserved", menu: "Menu",
    titleSuffix: "Cloister Protocol Docs",
    desc: "Cloister Protocol documentation — a compliant privacy layer for stablecoin payments on any EVM chain.",
  },
  de: {
    tagline: "DOCS", website: "Website", openApp: "App öffnen →", onThisPage: "Auf dieser Seite",
    footer: "© 2026 Cloister Protocol · Alle Rechte vorbehalten", menu: "Menü",
    titleSuffix: "Cloister Protocol Doku",
    desc: "Cloister-Protocol-Dokumentation — ein regelkonformer Privacy-Layer für Stablecoin-Zahlungen auf jeder EVM-Chain.",
  },
};

// filename -> output page, for rewriting intra-doc .md links in docs/<lang> sources
const FILE2PAGE = {};
for (const sec of NAV) for (const it of sec.items) {
  if (it.file) FILE2PAGE[it.file.toLowerCase()] = it.slug === "index" ? "index.html" : `${it.slug}.html`;
}
FILE2PAGE["readme.md"] = "index.html";
const GH = "https://github.com/joshuakrueger-dfx/cloister-protocol/blob/main/docs/en/";

function rewriteLinks(html) {
  // intra-doc .md links -> page slugs (or GitHub for ones we don't render). Relative
  // slugs resolve correctly within each language folder (root for en, /de/ for de).
  return html.replace(/href="([^"]+\.md)(#[^"]*)?"/g, (m, path, hash = "") => {
    const base = path.split("/").pop().toLowerCase();
    if (FILE2PAGE[base]) return `href="${FILE2PAGE[base]}${hash}"`;
    if (path.startsWith("http")) return m;
    return `href="${GH}${base}${hash}"`;
  });
}

const MARK = `<svg class="mark" viewBox="0 0 240 64" aria-label="Cloister"><circle cx="26" cy="32" r="16" fill="#F4F5F7"/><rect x="52" y="29" width="30" height="6" rx="3" fill="#F4F5F7"/><circle cx="120" cy="32" r="14.5" fill="none" stroke="#F4F5F7" stroke-width="5.5"/><rect x="158" y="29" width="30" height="6" rx="3" fill="#F4F5F7"/><circle cx="214" cy="32" r="16" fill="#F4F5F7"/></svg>`;

function navHtml(active, lang) {
  return NAV.map((sec) => `
    <div class="nav-sec">${sec.section[lang]}</div>
    ${sec.items.map((it) => {
      const href = it.slug === "index" ? "index.html" : `${it.slug}.html`;
      return `<a class="nav-link${it.slug === active ? " on" : ""}" href="${href}">${it.title[lang]}</a>`;
    }).join("")}`).join("");
}

function tocHtml(html, lang) {
  const heads = [...html.matchAll(/<h2 id="([^"]+)">(.*?)<\/h2>/g)];
  if (heads.length < 2) return "";
  return `<div class="toc"><div class="toc-h">${UI[lang].onThisPage}</div>${
    heads.map((h) => `<a href="#${h[1]}">${h[2].replace(/<[^>]+>/g, "")}</a>`).join("")
  }</div>`;
}

// language switcher: links each language to its counterpart of the same page.
// en pages live at the root, de pages under /de/.
function langSwitch(slug, lang) {
  const out = slug === "index" ? "index.html" : `${slug}.html`;
  const hrefTo = (target) =>
    target === lang ? "#" :
    target === "de" ? `de/${out}` : `../${out}`; // from en -> de/, from de -> ../
  return `<div class="langsw" role="group" aria-label="Language">${
    LANGS.map((l) => `<a class="lang${l === lang ? " on" : ""}" href="${hrefTo(l)}"${l === lang ? ' aria-current="true"' : ""} hreflang="${l}">${l.toUpperCase()}</a>`).join("")
  }</div>`;
}

const CSS = readFileSync(resolve(__dirname, "docs.css"), "utf8");
const BASE = "https://docs.cloister-protocol.com";
const urlFor = (slug, lang) => `${BASE}/${lang === "de" ? "de/" : ""}${slug === "index" ? "" : slug + ".html"}`;

function page({ slug, lang, contentHtml }) {
  const ui = UI[lang];
  const title = NAV.flatMap((s) => s.items).find((it) => it.slug === slug)?.title[lang] ?? slug;
  const canonical = urlFor(slug, lang);
  const alternates = LANGS.map((l) => `<link rel="alternate" hreflang="${l}" href="${urlFor(slug, l)}" />`).join("\n");
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} · ${ui.titleSuffix}</title>
<meta name="description" content="${ui.desc}" />
<link rel="canonical" href="${canonical}" />
${alternates}
<link rel="alternate" hreflang="x-default" href="${urlFor(slug, "en")}" />
<meta name="robots" content="index,follow,max-image-preview:large" />
<meta name="theme-color" content="#050506" />
<meta property="og:site_name" content="${ui.titleSuffix}" />
<meta property="og:type" content="article" />
<meta property="og:locale" content="${lang === "de" ? "de_DE" : "en_US"}" />
<meta property="og:title" content="${title} · ${ui.titleSuffix}" />
<meta property="og:description" content="${ui.desc}" />
<meta property="og:image" content="${BASE}/og.png" />
<meta property="og:url" content="${canonical}" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="alternate" type="text/markdown" href="/llms.txt" title="llms.txt" />
<style>${CSS}</style>
</head>
<body>
<div class="bg"></div>
<header class="topbar">
  <button class="menu" aria-label="${ui.menu}" onclick="document.body.classList.toggle('nav-open')">☰</button>
  <a class="brand" href="index.html">${MARK}<span>CLOISTER <b>${ui.tagline}</b></span></a>
  <div class="sp"></div>
  ${langSwitch(slug, lang)}
  <a class="tlink" href="https://dev.cloister-protocol.com">${ui.website}</a>
  <a class="tlink solid" href="https://app.cloister-protocol.com">${ui.openApp}</a>
</header>
<div class="scrim" onclick="document.body.classList.remove('nav-open')"></div>
<aside class="side">
  <nav>${navHtml(slug, lang)}</nav>
  <div class="side-foot">${ui.footer}</div>
</aside>
<main class="content">
  <article class="doc">${contentHtml}</article>
  ${tocHtml(contentHtml, lang)}
</main>
<script>
  // close the mobile nav when a link is tapped
  document.querySelectorAll(".side a").forEach(a=>a.addEventListener("click",()=>document.body.classList.remove("nav-open")));
</script>
</body>
</html>`;
}

// marked: add ids to headings for the TOC + anchor links
const renderer = new marked.Renderer();
const slugify = (s) => s.toLowerCase().replace(/<[^>]+>/g, "").replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, "");
renderer.heading = ({ tokens, depth }) => {
  const text = marked.parseInline(tokens.map((t) => t.raw).join(""));
  const id = slugify(text);
  return `<h${depth} id="${id}">${text}</h${depth}>\n`;
};

let count = 0;
for (const lang of LANGS) {
  for (const sec of NAV) for (const it of sec.items) {
    const md = it.page
      ? readFileSync(resolve(PAGES[lang], `${it.page}.md`), "utf8")
      : readFileSync(resolve(DOCS[lang], it.file), "utf8");
    const html = rewriteLinks(marked.parse(md, { renderer }));
    const file = it.slug === "index" ? "index.html" : `${it.slug}.html`;
    const out = lang === "de" ? resolve(OUT, "de", file) : resolve(OUT, file);
    writeFileSync(out, page({ slug: it.slug, lang, contentHtml: html }));
    count++;
  }
}

// assets
const fav = resolve(ROOT, "website/favicon.svg");
if (existsSync(fav)) copyFileSync(fav, resolve(OUT, "favicon.svg"));
const og = resolve(ROOT, "coming-soon/og.png");
if (existsSync(og)) copyFileSync(og, resolve(OUT, "og.png"));

// ---- SEO / agent-readable artifacts, derived from NAV so they never drift ----
const allItems = NAV.flatMap((s) => s.items);

// sitemap.xml — both languages, cross-linked with hreflang alternates
const SITEMAP_NS = "http://www.sitemaps.org/schemas/sitemap/0.9";
const XHTML_NS = "http://www.w3.org/1999/xhtml";
const altLinks = (slug) =>
  LANGS.map((l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${urlFor(slug, l)}"/>`).join("\n") +
  `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${urlFor(slug, "en")}"/>`;
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="${SITEMAP_NS}" xmlns:xhtml="${XHTML_NS}">
${LANGS.flatMap((l) => allItems.map((it) =>
  `  <url><loc>${urlFor(it.slug, l)}</loc>\n${altLinks(it.slug)}\n    <changefreq>weekly</changefreq><priority>${it.slug === "index" ? "1.0" : "0.7"}</priority></url>`
)).join("\n")}
</urlset>
`;
writeFileSync(resolve(OUT, "sitemap.xml"), sitemap);

// robots.txt — welcome indexers and AI agents
writeFileSync(resolve(OUT, "robots.txt"), `# Cloister Protocol Docs — all crawlers and AI agents welcome
User-agent: *
Allow: /

# Explicitly welcome AI/agent crawlers
User-agent: GPTBot
Allow: /
User-agent: OAI-SearchBot
Allow: /
User-agent: ChatGPT-User
Allow: /
User-agent: ClaudeBot
Allow: /
User-agent: Claude-Web
Allow: /
User-agent: PerplexityBot
Allow: /
User-agent: Google-Extended
Allow: /

Sitemap: ${BASE}/sitemap.xml
`);

// llms.txt — a concise, agent-readable map of the docs (llmstxt.org convention)
const llms = `# Cloister Protocol — Documentation

> A compliant privacy layer for stablecoin payments on any EVM chain.
> Cloister is a shielded payment pool: it hides the payer's address, amount and the
> payer-recipient link, while proving in zero knowledge that funds are clean (KYC-screened,
> association-set membership) and allowing selective audit via viewing keys. It is privacy WITH
> compliance — not an anonymous mixer. Status: Proof of Concept (pre-audit, test funds only).
> Available in English (root) and German (/de/).

## Documentation

${NAV.map((sec) => `### ${sec.section.en}\n${sec.items.map((it) => `- [${it.title.en}](${urlFor(it.slug, "en")})`).join("\n")}`).join("\n\n")}

## Dokumentation (Deutsch)

${NAV.map((sec) => `### ${sec.section.de}\n${sec.items.map((it) => `- [${it.title.de}](${urlFor(it.slug, "de")})`).join("\n")}`).join("\n\n")}

## Key facts

- First integration: OpenCryptoPay (protocol is rail-agnostic).
- ZK layer: gnark / Groth16 over BN254, Poseidon2 hashing, curve-free keys (pubKey = H(privKey)), 50,481-constraint circuit.
- ~350k gas per shielded payment (~5x cheaper) via off-chain Merkle insertion proven in-circuit.
- Self-custodial: on-device proving; the witness never leaves the device.
- Compliance: KYC-gated entry + association-set ("good-set") membership proofs + viewing-key disclosure.
- Any EVM L2 (reference: Base, Polygon, Arbitrum). Open HTTP API + SDK; additive, no lock-in.

## Links

- Website: https://cloister-protocol.com
- App: https://app.cloister-protocol.com
- Source: https://github.com/joshuakrueger-dfx/cloister-protocol
`;
writeFileSync(resolve(OUT, "llms.txt"), llms);

console.log(`built ${count} docs pages (en + de) + sitemap/robots/llms → ${OUT}`);
