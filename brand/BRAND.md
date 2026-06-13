# Cloister Protocol — Brand Book

Cloister is a **universal privacy layer for payments on any EVM chain** — a product of **DFX AG** (Switzerland). The brand is institutional, calm, technical and minimal: monochrome, generous whitespace, cinematic smoke. It should read as *serious financial infrastructure*, never as a hype crypto project.

---

## 1. Logo

The mark is the protocol in one glyph: **sender ● — shielded core ◯ — recipient ●**. A filled node pays, the hollow ring is the Cloister shield in the middle, a filled node receives. The link between them is broken into segments — privacy in transit.

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

SVG is the source of truth — infinitely scalable. PNGs are transparent and high-resolution for raster contexts.

**Clear space** — keep free space of at least the diameter of one node on all sides.
**Minimum size** — mark ≥ 20 px, logo ≥ 120 px wide on screen.

**Do**
- Use white on dark (preferred) or black on light.
- Keep the original proportions and the broken link segments.

**Don't**
- Recolor, add gradients, glows or shadows to the mark itself.
- Stretch, rotate, or fill the hollow ring.
- Place the light logo on a busy or light background.

---

## 2. Color

Strictly **monochrome** — deep black, soft greys, white, and translucent whites. No accent colors, no neon, no loud gradients.

| Token | Hex | Use |
|---|---|---|
| Black | `#050506` | Background base |
| Ink | `#07070A` | Dark logo, deepest surfaces |
| Grey 1 | `#0E0F12` | Raised surfaces |
| Grey 2 | `#16181C` | Cards, chips |
| White | `#F4F5F7` | Primary text, light logo |
| Dim | `rgba(244,245,247,.62)` | Secondary text |
| Faint | `rgba(244,245,247,.40)` | Tertiary text, labels |
| Line | `rgba(255,255,255,.08)` | Hairlines, borders |
| Glass | `rgba(255,255,255,.035)` | Glass card fill |

---

## 3. Typography

A clean Swiss-style sans on a strict grid.

- **Typeface:** Helvetica Neue → system fallback (`-apple-system, "Segoe UI", Inter, Arial`).
- **Display / headlines:** weight 600, tight tracking (`-0.02 … -0.03em`), large.
- **Body:** weight 400, line-height ~1.6, color *Dim*.
- **Labels / eyebrows:** 11–12 px, uppercase, letter-spacing `0.2em`, color *Faint*.
- **Mono (data / code):** `SF Mono`, `ui-monospace`, `Menlo` — for addresses, amounts, snippets.

---

## 4. Motion & the smoke motif

Smoke is the brand's signature: privacy made visible. Slow, soft, never aggressive.

- **Background:** a fBm domain-warped WebGL smoke field — diffuse grey fog on black, drifting slowly with a soft vignette. A light follows the cursor; **moving the cursor stirs the smoke** (a gentle vortex + drag).
- **Reveal:** sections fade in and rise (`cubic-bezier(.22,1,.36,1)`), never abrupt.
- **Privacy interaction:** sensitive transaction data (address, amount) **dissolves into a small smoke puff** on hover and is replaced by *Private* / *Shielded* — the data is protected, not deleted, and softly reappears on leave.
- **Glass cards:** lift 2–4 px on hover, borders brighten, the smoke behind becomes slightly more visible.

---

## 5. Tone of voice

Short, factual, clear. Explain privacy calmly. **No hype, no buzzwords, no exaggerated claims.**

- Say: *"Privacy for payments on any EVM chain."*
- Say: *"Not an anonymous mixer — shielded privacy with accountability."*
- Avoid: "revolutionary", "unhackable", "the future of money".

Always position Cloister as **compliant by design** (association sets, viewing keys, neutral governance) and **chain-agnostic**. OpenCryptoPay is named as the **first integration**, not the owner.

---

## 6. Attribution

Cloister Protocol is a product of **DFX AG**, Switzerland. Reference it in the eyebrow, the about line and the footer — not as a loud front-page banner.
