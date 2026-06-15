// Build the Cloister docs site: render curated Markdown into brand-styled,
// static HTML pages with a GitBook-style sidebar. SEO-friendly (pre-rendered).
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DOCS = resolve(ROOT, "docs/en");
const OUT = resolve(__dirname, "dist");
mkdirSync(OUT, { recursive: true });

// ---- curated navigation (internal audit/plan docs are intentionally excluded) ----
const FRESH = {
  introduction: {
    title: "Introduction",
    md: `# Cloister Protocol

> A compliant privacy layer for stablecoin payments on any EVM chain — by **DFX AG** (Switzerland).

Cloister is a **shielded payment pool** that breaks the on-chain link between a wallet and a
payment. Nobody — not the merchant, not an on-chain observer, not even the settlement broker —
learns the payer's address or can derive their balances and net worth from it.

Crucially, privacy here is **provable, not opaque**. Every payout carries a zero-knowledge proof
that the funds belong to a screened compliance good-set and originate from a KYC-verified source.
So a user can stay private **and** demonstrate clean origin to a bank, auditor or tax authority on
demand. It is privacy *with* accountability — **not an anonymous mixer**.

## At a glance

- **Privacy by default** — the payer's address never appears as the transaction sender or in the calldata.
- **Compliance by design** — only screened funds are admitted; viewing keys give authorized auditors selective, time-bounded disclosure.
- **Any EVM chain** — identical contracts and once-compiled circuits deploy to any EVM L2 (Base, Polygon, Arbitrum, …).
- **Built for builders** — an open, additive HTTP API + SDK; any wallet or PSP can integrate, with no lock-in.

## Where to start

- New here? Read **[How it works](how-it-works.html)** for the four-step payment flow.
- Want the deep design? See **[Architecture](architecture.html)** and the **[Circuit specification](circuit.html)**.
- Integrating? Jump to the **[Integration guide](integration.html)**.

> **Status:** Proof of Concept. The contracts and circuit were hardened in an internal adversarial
> audit; external audits and a production trusted-setup ceremony are still pending before mainnet.`,
  },
  "how-it-works": {
    title: "How it works",
    md: `# How it works

A shielded, encrypted pool — deposit, pay privately, settle on-chain, without revealing the payer's
identity. Four steps:

## 1 · Shield

You load funds into the pool once. This is the **only public touchpoint** — KYC, sanctions
screening and geofencing run here. From then on your balance lives in the pool as an encrypted
commitment.

## 2 · Pay privately

A **zk-SNARK proof** authorizes the payment and a **broadcast-only relayer** sends it and pays the
gas. The payer's address never appears on-chain — the internal payment is an encrypted note, not a
visible transfer.

## 3 · Off-chain insertion

The contract computes **zero hashes on-chain**; the proof itself attests to the Merkle update.
Result: about **350k gas per payment instead of ~1.74M — roughly 5× less**.

## 4 · Parallel lanes

Multiple independent lanes let payments land in the **same block in parallel** (6 of 6 in the PoC).
View-tags let wallets find their own notes quickly — without decrypting anyone else's.

---

The privacy comes from the zero-knowledge note layer; the compliance comes from
**[association-set inclusion](privacy.html)** and **[viewing keys](security.html)**. Read on for the
full design.`,
  },
};

const NAV = [
  { section: "Overview", items: [
    { slug: "index", title: "Introduction", fresh: "introduction" },
    { slug: "how-it-works", title: "How it works", fresh: "how-it-works" },
  ]},
  { section: "Protocol", items: [
    { slug: "architecture", title: "Architecture", file: "ARCHITECTURE.md" },
    { slug: "circuit", title: "Circuit (ZK)", file: "CIRCUIT.md" },
    { slug: "privacy", title: "Privacy", file: "PRIVACY.md" },
    { slug: "security", title: "Security", file: "SECURITY.md" },
  ]},
  { section: "Build", items: [
    { slug: "integration", title: "Integration", file: "INTEGRATION.md" },
    { slug: "deployment", title: "Deployment", file: "DEPLOYMENT.md" },
    { slug: "fallbacks", title: "Fallbacks & resilience", file: "FALLBACKS.md" },
    { slug: "validation", title: "Validation", file: "VALIDATION.md" },
  ]},
];

// filename -> output page, for rewriting intra-doc .md links
const FILE2PAGE = {};
for (const sec of NAV) for (const it of sec.items) {
  if (it.file) FILE2PAGE[it.file.toLowerCase()] = it.slug === "index" ? "index.html" : `${it.slug}.html`;
}
FILE2PAGE["readme.md"] = "index.html";
const GH = "https://github.com/joshuakrueger-dfx/cloister-protocol/blob/main/docs/en/";

function rewriteLinks(html) {
  // intra-doc .md links -> page slugs (or GitHub for ones we don't render)
  return html.replace(/href="([^"]+\.md)(#[^"]*)?"/g, (m, path, hash = "") => {
    const base = path.split("/").pop().toLowerCase();
    if (FILE2PAGE[base]) return `href="${FILE2PAGE[base]}${hash}"`;
    if (path.startsWith("http")) return m;
    return `href="${GH}${base}${hash}"`;
  });
}

const MARK = `<svg class="mark" viewBox="0 0 240 64" aria-label="Cloister"><circle cx="26" cy="32" r="16" fill="#F4F5F7"/><rect x="52" y="29" width="30" height="6" rx="3" fill="#F4F5F7"/><circle cx="120" cy="32" r="14.5" fill="none" stroke="#F4F5F7" stroke-width="5.5"/><rect x="158" y="29" width="30" height="6" rx="3" fill="#F4F5F7"/><circle cx="214" cy="32" r="16" fill="#F4F5F7"/></svg>`;

function navHtml(active) {
  return NAV.map((sec) => `
    <div class="nav-sec">${sec.section}</div>
    ${sec.items.map((it) => {
      const href = it.slug === "index" ? "index.html" : `${it.slug}.html`;
      return `<a class="nav-link${it.slug === active ? " on" : ""}" href="${href}">${it.title}</a>`;
    }).join("")}`).join("");
}

function tocHtml(html) {
  const heads = [...html.matchAll(/<h2 id="([^"]+)">(.*?)<\/h2>/g)];
  if (heads.length < 2) return "";
  return `<div class="toc"><div class="toc-h">On this page</div>${
    heads.map((h) => `<a href="#${h[1]}">${h[2].replace(/<[^>]+>/g, "")}</a>`).join("")
  }</div>`;
}

const CSS = readFileSync(resolve(__dirname, "docs.css"), "utf8");

function page({ slug, title, contentHtml }) {
  const isHome = slug === "index";
  const canonical = `https://docs.cloister-protocol.com/${isHome ? "" : slug + ".html"}`;
  const desc = "Cloister Protocol documentation — a compliant privacy layer for stablecoin payments on any EVM chain. A product of DFX AG.";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} · Cloister Protocol Docs</title>
<meta name="description" content="${desc}" />
<link rel="canonical" href="${canonical}" />
<meta name="robots" content="index,follow,max-image-preview:large" />
<meta name="theme-color" content="#050506" />
<meta property="og:site_name" content="Cloister Protocol Docs" />
<meta property="og:type" content="article" />
<meta property="og:title" content="${title} · Cloister Protocol Docs" />
<meta property="og:description" content="${desc}" />
<meta property="og:image" content="https://docs.cloister-protocol.com/og.png" />
<meta property="og:url" content="${canonical}" />
<meta name="twitter:card" content="summary_large_image" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="alternate" type="text/markdown" href="/llms.txt" title="llms.txt" />
<style>${CSS}</style>
</head>
<body>
<div class="bg"></div>
<header class="topbar">
  <button class="menu" aria-label="Menu" onclick="document.body.classList.toggle('nav-open')">☰</button>
  <a class="brand" href="index.html">${MARK}<span>CLOISTER <b>DOCS</b></span></a>
  <div class="sp"></div>
  <a class="tlink" href="https://dev.cloister-protocol.com">Website</a>
  <a class="tlink solid" href="https://app.cloister-protocol.com">Open App →</a>
</header>
<div class="scrim" onclick="document.body.classList.remove('nav-open')"></div>
<aside class="side">
  <nav>${navHtml(slug)}</nav>
  <div class="side-foot">© 2026 DFX AG · All rights reserved</div>
</aside>
<main class="content">
  <article class="doc">${contentHtml}</article>
  ${tocHtml(contentHtml)}
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
for (const sec of NAV) for (const it of sec.items) {
  const md = it.fresh ? FRESH[it.fresh].md : readFileSync(resolve(DOCS, it.file), "utf8");
  const html = rewriteLinks(marked.parse(md, { renderer }));
  const out = it.slug === "index" ? "index.html" : `${it.slug}.html`;
  writeFileSync(resolve(OUT, out), page({ slug: it.slug, title: it.title, contentHtml: html }));
  count++;
}

// assets
const fav = resolve(ROOT, "website/favicon.svg");
if (existsSync(fav)) copyFileSync(fav, resolve(OUT, "favicon.svg"));
const og = resolve(ROOT, "coming-soon/og.png");
if (existsSync(og)) copyFileSync(og, resolve(OUT, "og.png"));

console.log(`built ${count} docs pages → ${OUT}`);
