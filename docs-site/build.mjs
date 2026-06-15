// Build the Cloister docs site: render curated Markdown into brand-styled,
// static HTML pages with a GitBook-style sidebar. SEO-friendly (pre-rendered).
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DOCS = resolve(ROOT, "docs/en");
const PAGES = resolve(__dirname, "pages");
const OUT = resolve(__dirname, "dist");
mkdirSync(OUT, { recursive: true });

// ---- curated navigation. Pages come from docs-site/pages/*.md (authored for the
// docs site) or docs/en/*.md (the as-built technical spec). Internal audit/plan docs
// are intentionally excluded. ----
const NAV = [
  { section: "Overview", items: [
    { slug: "index", title: "Introduction", page: "introduction" },
    { slug: "how-it-works", title: "How it works", page: "how-it-works" },
    { slug: "why-cloister", title: "Why Cloister", page: "why-cloister" },
  ]},
  { section: "Core concepts", items: [
    { slug: "concept-pool", title: "The shielded pool", page: "concept-pool" },
    { slug: "concept-shield", title: "Shielding funds", page: "concept-shield" },
    { slug: "concept-pay", title: "Private payments", page: "concept-pay" },
    { slug: "concept-association", title: "Association sets & compliance", page: "concept-association" },
    { slug: "concept-viewing-keys", title: "Viewing keys & disclosure", page: "concept-viewing-keys" },
    { slug: "concept-keys", title: "Keys & recovery", page: "concept-keys" },
  ]},
  { section: "Protocol", items: [
    { slug: "architecture", title: "Architecture", file: "ARCHITECTURE.md" },
    { slug: "circuit", title: "Circuit specification", file: "CIRCUIT.md" },
    { slug: "privacy", title: "Privacy model", file: "PRIVACY.md" },
    { slug: "security", title: "Security", file: "SECURITY.md" },
    { slug: "fallbacks", title: "Fallbacks & resilience", file: "FALLBACKS.md" },
  ]},
  { section: "Build", items: [
    { slug: "integration", title: "Integration", file: "INTEGRATION.md" },
    { slug: "smart-contracts", title: "Smart contracts", page: "smart-contracts" },
    { slug: "deployment", title: "Deployment", file: "DEPLOYMENT.md" },
    { slug: "validation", title: "Validation", file: "VALIDATION.md" },
  ]},
  { section: "Resources", items: [
    { slug: "faq", title: "FAQ", page: "faq" },
    { slug: "glossary", title: "Glossary", page: "glossary" },
  ]},
  { section: "Legal", items: [
    { slug: "disclaimer", title: "Disclaimer", page: "disclaimer" },
    { slug: "privacy-policy", title: "Privacy policy", page: "privacy-policy" },
    { slug: "imprint", title: "Imprint", page: "imprint" },
  ]},
];

// filename -> output page, for rewriting intra-doc .md links in docs/en sources
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
  const md = it.page
    ? readFileSync(resolve(PAGES, `${it.page}.md`), "utf8")
    : readFileSync(resolve(DOCS, it.file), "utf8");
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

// ---- SEO / agent-readable artifacts, derived from NAV so they never drift ----
const BASE = "https://docs.cloister-protocol.com";
const urlFor = (slug) => `${BASE}/${slug === "index" ? "" : slug + ".html"}`;
const allItems = NAV.flatMap((s) => s.items);

// sitemap.xml
const SITEMAP_NS = "http://www.sitemaps.org/schemas/sitemap/0.9";
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="${SITEMAP_NS}">
${allItems.map((it) => `  <url><loc>${urlFor(it.slug)}</loc><changefreq>weekly</changefreq><priority>${it.slug === "index" ? "1.0" : "0.7"}</priority></url>`).join("\n")}
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

> A compliant privacy layer for stablecoin payments on any EVM chain, by DFX AG (Switzerland).
> Cloister is a shielded payment pool: it hides the payer's address, amount and the
> payer-recipient link, while proving in zero knowledge that funds are clean (KYC-screened,
> association-set membership) and allowing selective audit via viewing keys. It is privacy WITH
> compliance — not an anonymous mixer. Status: Proof of Concept (pre-audit, test funds only).

## Documentation

${NAV.map((sec) => `### ${sec.section}\n${sec.items.map((it) => `- [${it.title}](${urlFor(it.slug)})`).join("\n")}`).join("\n\n")}

## Key facts

- Built by DFX AG, Switzerland. First integration: OpenCryptoPay (protocol is rail-agnostic).
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

console.log(`built ${count} docs pages + sitemap/robots/llms → ${OUT}`);
