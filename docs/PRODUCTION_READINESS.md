# Cloister — Produktisierung & Skalierung (offene Blocker)

> Was zwischen dem heutigen PoC und einem „seriösen Tool für Millionen Zahlungen auf Base"
> steht. Sortiert nach **was den Pitch/Launch zuerst killt**. Jeder Punkt ist ein späteres
> Arbeitspaket. Verweise: [`CONCEPT.md`](CONCEPT.md), [`ARCHITECTURE.md`](ARCHITECTURE.md),
> [`BENCHMARK.md`](BENCHMARK.md).
>
> Stand: 2026-06-12 · Status: Backlog v0.1

Legende: **[P0]** Show-Stopper vor jedem ernsthaften Gespräch · **[P1]** vor Produktion ·
**[P2]** vor Skalierung auf Millionen.

---

## 1. Regulatorik — wahrscheinlichster Dealbreaker (Base/Coinbase)
Bei einem US-börsennotierten Konzern ist das Punkt 1, nicht die Kryptografie.

- **[P0] „Compliant privacy" beweisbar im Code, nicht nur im Konzept.** ASP-Inclusion-Proofs
  + Viewing-Key-Disclosure (Level 3) müssen im Circuit/Stack live sein, bevor man pitcht.
  Aktuell pitcht man sonst die gefährliche Hälfte (Mixer) ohne die rettende (Compliance).
- **[P0] Legal-Memo CH/EU/US** von einer spezialisierten Kanzlei: Tornado-Cash/OFAC-Präzedenz,
  Sanktions-Exposure, warum ASP+Viewing-Key das Geldwäsche-Narrativ bricht.
- **[P0] Money-Transmission / MSB-Struktur.** Wer hält Gelder, welche Lizenzen (US pro Bundes-
  staat, EU MiCA/PSD2)? Settlement-Intermediär = lizenzpflichtiger Geldtransmitter.
- **[P1] Travel-Rule-Story** für regulierte Händler/PSPs.

## 2. Security-Reife — existenziell bei echtem Geld
- **[P0] Multi-Party Trusted-Setup-Ceremony** statt lokalem Single-Contributor (sonst kann
  jemand Geld aus dem Nichts prägen).
- **[P0] Zwei unabhängige ZK-Audits** (Circuits + Contracts), je ~$100–500k, Monate Vorlauf.
- **[P1] Schlüsselmodell:** Owner-Pubkey ist jetzt echter BabyJubJub (privKey·Base8) ✔.
  Nullifier bewusst Poseidon-PRF (deterministisch/nicht-malleable) statt EdDSA-Signatur — eine
  EdDSA-Signatur im Nullifier wäre malleable (Double-Spend). Offen: volle Key-Hierarchie
  (separate Spend-/View-/Nullifier-Keys), in-circuit Konsistenz-Checks, formales Review.
- **[P1] Formale Constraint-Reviews** (Under-constrained-Bugs sind die häufigste ZK-Lücke).

## 3. Skalierung — die konkreten technischen Engpässe
„Millionen Zahlungen" trifft genau die teuren Stellen der heutigen Architektur.

- **[P1] On-chain-Insert war der echte Bottleneck → umgesetzt (PoC).** Statt on-chain
  `_insert` (~40 Poseidon/Tx, ~1.74M Gas) beweist der Circuit jetzt die Root-Transition
  oldRoot→newRoot; der Contract rechnet **0 Poseidon** → **~350k Gas/Tx (~5×)**, siehe
  [`BENCHMARK.md`](BENCHMARK.md) §5b. **Parallelität umgesetzt (PoC):** `numLanes` unabhängige
  Roots (sharded) — Zahlungen in verschiedenen Lanes landen gemeinsam in einem Block (6/6 in
  `pnpm demo:parallel`), nur same-lane serialisiert; Durchsatz skaliert mit der Lane-Zahl.
  Offen: Relayer-Lane-Zuweisung/Load-Balancing, lane-übergreifendes Spending, und für sehr
  hohen Durchsatz Validium/App-Chain. Tradeoff: Anonymitäts-Set splittet pro Lane (numLanes
  klein halten bzw. Lanes mergebar machen).
- **[P1] Indexer + Note-Tagging.** Heute scannt jedes Wallet *jedes* Commitment → Minuten-Sync
  bei Millionen Txs. Eigene Indexer-Infra + Tagging (Railgun/zkBob-Stil) nötig, sonst
  unbenutzbare Wallet-UX.
- **[P2] Baum-Kapazität:** Tiefe 20 (~1M Leaves) reicht nicht; jede Zahlung erzeugt 2
  Commitments. Tiefe 26–32 + Baum-Rotation/Mehrere Bäume.
- **[P2] Native Mobil-Prover** (+ optional server-assisted Proving mit MPC-Key-Split für
  Low-End-Geräte, Privacy-Tradeoff dokumentieren).
- **[P2] Relayer-Throughput/Mempool** für Spitzenlast.

## 4. Anonymitäts-Set — Privacy ist nur so groß wie die Menge
- **[P1] Cold-Start lösen:** kleiner Set = schwache Privacy. Onramp-Käufe default in den Pool;
  Mindest-Set-Größe pro Asset überwachen/warnen.
- **[P1] Ein kanonischer, geteilter Pool** statt pro-PSP-Fragmentierung (CONCEPT §12.4) — mit
  **neutraler, multi-stakeholder Governance**, sonst bauen Dritte eigene Pools und die
  Privacy fällt.

## 5. Trust, Custody, Anti-Abuse
- **[P1] Custody-Struktur fürs Aggregat-Settlement:** Working Capital, Custody-Lizenz,
  Honeypot-Risiko (Millionen-Volumen = Angriffsziel). Trust-Fenster minimieren.
- **[P1] Relayer-Dezentralisierung/Anti-Zensur** + Self-Broadcast-Fallback.
- **[P2] Anti-Abuse:** Dust-/Spam-Schutz (Tree-Filling), MEV, DoS, Griefing, Fee-Markt.

## 6. Strategie / Differenzierung
- **[P1] „Buy vs build"-Antwort:** Warum eigener Pool statt Integration eines auditierten
  bestehenden (Railgun, Privacy Pools/0xbow, Aztec, Stealth-Addresses)? Differenzierer =
  **OCP-Integration + compliant-by-design ASP + Resale/White-Label-Layer**, nicht „noch ein
  Shielded Pool".
- **[P1] Base-spezifisches Narrativ:** Anschluss an Onchain-Commerce/USDC; Privacy auf den
  großen L2 (Polygon/Base/Arbitrum), kein Ethereum L1.

---

## Empfohlene Reihenfolge vor einem Base-Pitch
1. **[P0]** Compliance-Layer in den Circuit (ASP + Viewing-Key) + Legal-Memo CH/EU/US.
2. **[P1]** Batched-Insertion-Redesign + Indexer (sonst hält das „Millionen"-Versprechen nicht).
3. **[P0/P1]** Audit + Multi-Party-Setup eingeplant/teilfinanziert (zeigt Ernsthaftigkeit).
4. **[P1]** Custody-/Money-Transmission-Struktur geklärt.
5. **[P1]** Differenzierungs-Narrativ gegenüber Railgun/Privacy Pools geschärft.

> Kernsatz fürs Steuern: Der PoC beweist, dass die Privacy-Mechanik funktioniert und
> compliant gedacht ist. Der Sprung auf Base-Niveau steht und fällt mit **Regulatorik +
> auditierter Sicherheit + skalierendem Insert/Indexing-Layer** — nicht mit mehr ZK-Features.
