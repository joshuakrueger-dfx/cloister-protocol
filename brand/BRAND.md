# Cloister Protocol — Brand Book

The single source of truth for how Cloister looks, reads and moves. It mirrors the live tokens in
`website/index.html` — if you change one, change the other.

Cloister is a **universal privacy layer for payments on any EVM chain** — a product of **DFX AG**
(Switzerland). The brand is institutional, calm, technical and minimal: a near-black canvas, generous
whitespace, cinematic smoke, and **one restrained cool-blue accent**. It should read as *serious
financial infrastructure*, never as a hype crypto project.

> Status: v2 (2026-06-16). v1 was strictly monochrome; v2 adopts a single, disciplined accent
> (`#6e9bff`) as the Cloister signature and raises the text-contrast floors for legibility. Tune the
> accent hue if brand decides — then update this doc *and* the `--accent*` tokens together.

---

## 1. Essence

**Privacy with accountability — not an anonymous mixer.** Everything (copy, color, motion) should feel
**calm, precise, trustworthy, understated**. We are the opposite of loud "crypto": no neon, no hype, no
jargon. If a choice reads as flashy, it's wrong.

**Voice:** plain language a non-crypto person understands (no "zk-SNARK" in headlines; explain it).
Confident, quiet, exact. Never overstate — say "Proof of Concept" when it is one; never "audited"
unless an external audit happened. (See the website FAQ + `AUDIT_READINESS.md`.)

- Say: *"Privacy for payments on any EVM chain."*
- Say: *"Not an anonymous mixer — shielded privacy with accountability."*
- Avoid: "revolutionary", "unhackable", "the future of money".

Position Cloister as **compliant by design** (screened deposits, viewing keys, neutral governance) and
**chain-agnostic**. OpenCryptoPay is the **first integration**, not the owner.

---

## 2. Logo

The mark is the protocol in one glyph: **sender ● — shielded core ◯ — recipient ●**. A filled node
pays, the hollow ring is the Cloister shield in the middle, a filled node receives. The link between
them is broken into segments — privacy in transit.

```
●  —  ◯  —  ●
sender  shield  recipient
```

**Lockups**
- **Mark** — the symbol alone (app icons, favicons, avatars, tight spaces).
- **Logo** — mark + wordmark `CLOISTER PROTOCOL` (default, headers, docs).

**Files** (`brand/`)

| Asset | SVG | PNG (transparent) |
|---|---|---|
| Mark, light (on dark) | `logo/cloister-mark-white.svg` | `png/cloister-mark-white.png` |
| Mark, dark (on light) | `logo/cloister-mark-black.svg` | `png/cloister-mark-black.png` |
| Logo, light (on dark) | `logo/cloister-logo-white.svg` | `png/cloister-logo-white.png` |
| Logo, dark (on light) | `logo/cloister-logo-black.svg` | `png/cloister-logo-black.png` |

SVG is the source of truth — infinitely scalable. PNGs are transparent and high-resolution for raster
contexts. In-page, the wordmark renders as `.mark` (1.5px strokes) + `CLOISTER PROTOCOL` (12px,
`letter-spacing: .14em`, weight 600, two lines).

**Clear space** — keep free space of at least the diameter of one node on all sides.
**Minimum size** — mark ≥ 20px, logo ≥ 120px wide on screen.

**Do** — white on dark (preferred) or black on light; keep the original proportions and the broken link
segments. **Don't** — recolor, gradient, glow or shadow the mark itself; stretch, rotate or fill the
hollow ring; place the light logo on a busy or light background.

---

## 3. Color

Dark-first. Near-black canvas, soft off-white ink, hairline structure, and **one cool accent used
sparingly**.

| Token | Value | Use |
|---|---|---|
| `--black` | `#050506` | Page canvas (warm near-black, never pure `#000`) |
| `--grey-1 / --grey-2` | `#0e0f12 / #16181c` | Raised surfaces, cards, chips |
| `--white` | `#f4f5f7` | Primary text + solid CTA fill (soft white, never pure `#fff`) |
| `--dim` | `rgba(244,245,247,.76)` | Body text — **min for any running text** (AA on `--black`) |
| `--faint` | `rgba(244,245,247,.56)` | Eyebrows, captions, meta — **floor for any text** |
| `--line / --line-2` | `rgba(255,255,255,.08 / .16)` | Hairline borders / hover borders |
| `--glass` | `rgba(255,255,255,.035)` | Glass-card fill (with `backdrop-filter: blur(14px)`) |
| **`--accent`** | **`#6e9bff`** | Cloister signature — a calm "shielded" cool blue |
| `--accent-soft` | `rgba(110,155,255,.16)` | Accent glow / tint fills |
| `--accent-line` | `rgba(110,155,255,.45)` | Accent borders / rings |

**Accent discipline (the most important rule).** The accent is a *signature, not a theme*. Use it on at
most a few elements per view: the **shield mark** (incl. its hover smoke aura), the **eyebrow dot**,
**link underlines**, **step number badges**, the **active language toggle / focus rings**. Do **not**
color body text, headings, large fills or the primary CTA with it (the CTA stays white-on-dark). One
restrained blue moment > blue everywhere.

**Contrast floor:** no text below `--faint` (.56). The old `.40`/`.62` greys are retired.

---

## 4. Typography

A clean Swiss-style sans on a strict grid.

- **Family:** `"Helvetica Neue", -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Arial, sans-serif`.
- **Display (h1):** `clamp(40px, 5.4vw, 76px)`, weight 600, `letter-spacing: -.03em`, `line-height: 1`, **`text-wrap: balance`** (no orphan words).
- **Section (h2):** `clamp(28px, 3.6vw, 44px)`, weight 600, `-.02em`, `line-height: 1.06`.
- **Body / lede:** 15–17px, `line-height: 1.6`, color `--dim`.
- **Eyebrow / labels:** 11px, **uppercase**, `letter-spacing: .2em`, color `--faint`, preceded by a small accent dot.
- **Mono (data / code):** `SF Mono`, `ui-monospace`, `Menlo` — addresses, amounts, snippets.
- **Weights:** 500 (buttons/UI) and 600 (headings/emphasis) only. No 700/black.

---

## 5. Layout, spacing & motion

- **Max width** `--max: 1240px`; gutter `28px`.
- **Section rhythm:** `~66px` vertical padding, separated by a single `--line` rule. Generous breathing room.
- **Radius:** cards `22px`, controls `9–11px`.
- **Surfaces:** the **glass card** (`--glass` + blur + hairline gradient border + soft inset) is the one container language. Don't invent new card styles.
- **One easing** — `cubic-bezier(.22, 1, .36, 1)`. Scroll-reveal fades (~.85s) on enter; never abrupt.
- **Hover:** glass cards lift `translateY(-4px)` and brighten their border; the smoke behind grows slightly more visible.
- **Always honor `prefers-reduced-motion`** — the shader, reveals and the shield smoke must fall back to static.

---

## 6. The smoke motif

Smoke is the brand's signature: privacy made visible. Slow, soft, never aggressive.

- **Background:** an fBm domain-warped WebGL smoke field — diffuse grey fog on black, drifting slowly with a soft vignette. A light follows the cursor.
- **Shield aura:** hovering the shield mark wraps it in wisps of smoke that curl outward and up; the glyph stays crisp and its accent glow charges up. ~⅓ of the wisps carry the cool-blue accent — the shield emitting its "shielded" aura.
- **Privacy interaction:** sensitive transaction data (address, amount) **dissolves into a small smoke puff** on hover and is replaced by *Private* / *Shielded* — the data is protected, not deleted, and softly reappears on leave.

---

## 7. Components

- **Buttons:** `.btn` (hairline, ghost) and `.btn-solid` (white fill, dark text) for the primary CTA. Trailing `→` that nudges on hover. Never an accent-filled button.
- **Links:** text + `→`, with an accent underline that wipes in on hover.
- **Glass card:** the universal surface (hero diagram, code blocks, example tx, CTA).
- **Metrics strip:** hairline-divided columns; big number (30px/600) + small `--dim` label.
- **Steps:** numbered `01–04` badges in accent (`--accent` text on `--accent-soft` fill + `--accent-line` border) with a bespoke line icon each.
- **Tags/pills:** hairline chips; a dashed `.more` variant for "… and more".
- **Mobile nav:** ≤940px the desktop links collapse into a burger (`#navburger`) → dropdown (`#navmobile`); accessible via `aria-expanded`/`aria-controls`. Never hide nav with no replacement.

---

## 8. Iconography

- **Style:** line icons, **1.5px stroke**, rounded joins, on a 24px grid; neutral `--white`/`--dim`. Spare and consistent — no filled/duotone mixing.
- **Accent only for the shield:** it is the brand's one hero glyph and carries the accent glow. Use it as the recurring "Cloister" symbol.

---

## 9. Do / Don't

**Do** — keep it dark, quiet and exact; lead with plain-language benefit; use the accent as a single
signature beat; honor reduced-motion; state status honestly.

**Don't** — pure `#000`/`#fff`; text below `--faint`; accent on body/headings/primary CTA; neon or
multiple accent colors; crypto jargon in headlines; "audited"/"live"/"production-ready" claims that
aren't true; new ad-hoc card or button styles.

---

## 10. Accessibility

Dark theme with AA-clearing text (`--dim`/`--faint` floors), `prefers-reduced-motion` fallbacks,
focus-visible rings (accent), semantic headings, and nav reachable on every breakpoint (the mobile
burger). Verify contrast on any new text color before shipping.

---

## 11. Attribution

Cloister Protocol is a product of **DFX AG**, Switzerland. Reference it in the eyebrow, the about line
and the footer — not as a loud front-page banner.
