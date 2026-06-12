# Cloister — Kosten- & Latenz-Benchmark (v0.1)

> **Status: referenz-abgeleitete Schätzung, keine eigene Messung.** Unsere Contracts/Circuits
> existieren noch nicht — die Zahlen stammen aus veröffentlichten Werten vergleichbarer
> Systeme (Railgun, Tornado Nova, Groth16-Verifier-Analysen, Live-L2-Gastracker) plus einem
> parametrischen Modell. Vor Produktionsentscheid durch **eigene Testnet-Messung** ersetzen
> (§6). Stand: 2026-06-12.

**Scope: L2-only — Polygon, Base, Arbitrum.** Ethereum L1 ist kein Ziel (Shielded-Tx dort im
Dollar-Bereich → unwirtschaftlich für Kassenzahlungen).

**Markt-Annahmen (einsetzbar/aktualisierbar):**
- Arbitrum/Base L2-Gaspreis ≈ **0,02 gwei** (arbiscan/ethgastracker, Floor 0,1 gwei, real darunter)
- Gas-Token-Preis für $-Umrechnung: ETH ≈ **$1.650** (Base/Arbitrum zahlen Gas in ETH; Polygon
  in POL — dort separaten POL-Preis einsetzen) (11.06.2026, metamask/fortune)

---

## 1. Latenz — Proof-Generierung im Wallet

Treiber ist die **Circuit-Größe** (Anzahl Constraints ≈ f(#Input-Notes, #Output-Notes)).
Basis-Datenpunkt aus der Forschung: **~62.000 Constraints ≈ 6 s single-thread**, mit
multi-threaded WASM/native **< 1 s** möglich (Circom-Browser-Proving gilt als schnellste
Variante). Daraus extrapoliert für ein Railgun-artiges UTXO-Transact:

| Circuit (In×Out) | grobe Constraints | Proof-Zeit Mid-Range-Phone (multi-thread) | Einsatz |
|---|---|---|---|
| **1×2** | ~10–30k | **~1–3 s** | Standard-Zahlung aus vorgeladenem Guthaben (Ziel-Profil) |
| 2×2 | ~30–60k | ~2–5 s | Zahlung, die 2 Notes kombinieren muss |
| 2×3 | ~50–80k | ~3–7 s | Zahlung + extra Output (z. B. Decoy) |
| 8×2 | ~150k+ | ~10–20 s | Note-Konsolidierung (Hintergrund, nicht an der Kasse) |

**Konsequenz fürs UX-Ziel (~1–2 s gefühlt 0):**
- Guthaben in kleinen Stückelungen halten → Zahlungen bleiben **1×2**.
- Proof-Start ab Schritt 3 (Betrag bekannt), parallel zum Bestätigen-Tap → die 1–3 s
  überlappen mit ohnehin nötiger Nutzeraktion.
- Prover vorgewärmt (Keys geladen, Notes indexiert) → kein Kaltstart.
- Konsolidierung (teure große Circuits) **nur im Hintergrund** bei idle + billigem Gas.

> Multi-thread/native Prover ist hier der Hebel: derselbe Circuit kann je nach Implementierung
> 6 s **oder** <1 s brauchen. Das ist die wichtigste eigene Messgröße (§6).

---

## 2. Gas — eine Shielded-Zahlung vs. Baseline

**Komponenten eines `transact`:** Groth16-Verify + Merkle-Tree-Insert(s) + Nullifier-Write(s)
+ Event-Emission.

- **Groth16-Verify:** ~**181k + 6k·ℓ** Gas (ℓ = #public-inputs), praktisch **~200–250k** Gas
  naiv; optimiert <100k möglich. (BN254-Pairing-Precompile 0x08 ≈ 34k/Pairing, 3–4 Pairings.)
- **Rest (Merkle/Nullifier/Events):** stark implementierungsabhängig.

**Annahme für das Modell (Range, bis eigene Messung vorliegt):**

| Operation | Gas (geschätzt) | Anmerkung |
|---|---|---|
| Baseline ERC-20-Transfer (heutiger OCP-Flow) | ~50–65k | Referenz |
| **Shielded `transact` (1×2)** | **~300–500k** | Verify + 1 Insert + 1–2 Nullifier |
| Shielded `transact` (2×2) | ~450–700k | mehr Inputs/Outputs |
| Shield (Deposit, einmalig) | ~150–250k | amortisiert über viele Zahlungen |
| DFX Aggregat-Unshield | ~250–400k / **geteilt durch N Zahlungen** | gebündelt (Stufe 2) |

→ Shielded ist grob **~5–10× Gas** ggü. einem Plain-Transfer. Entscheidend ist der
**absolute** Effekt (§3).

---

## 3. Kosten in $ — auf den Ziel-L2 (Polygon/Base/Arbitrum)

Formel: `Kosten = GasUnits × GasPreis(gwei) × 1e-9 × GasToken-Preis($)`

### Arbitrum/Base (0,02 gwei, nur Execution)
| Operation | Gas | Execution-Kosten |
|---|---|---|
| Baseline Transfer | 65k | **~$0,002** |
| Shielded transact (1×2) | 400k | **~$0,013** |
| Shielded transact (2×2) | 600k | ~$0,020 |

> Hinweis: Dazu kommt die **L1-Data-Posting-Komponente** des L2. Seit Blobs (EIP-4844) ist sie
> klein; realistisch landet eine Shielded-Zahlung **im niedrigen Cent-Bereich (~$0,02–0,15)**
> statt nur bei den Execution-Cents. Größenordnung bleibt: **Cent, nicht Dollar.**

### Polygon
Gas wird in **POL** statt ETH bezahlt; Gaspreise liegen typischerweise höher in gwei, der
POL-Preis aber deutlich unter ETH → in $ ebenfalls **Cent-Bereich**. Exakter POL-Preis +
aktueller Polygon-Gaspreis in die Formel einsetzen (in §6 messen).

→ **Klares Ergebnis:** Auf allen drei Ziel-L2 ist Privacy **faktisch gratis (Cent-Bereich)**.
Genau deshalb **L2-only, kein Ethereum L1** (dort wäre dieselbe Tx ein einstelliger
Dollar-Betrag und damit für Kassenzahlungen unwirtschaftlich).

---

## 4. Service-Gebühren (oben drauf)

Aus dem Railgun-Referenzmodell (anpassbar für DFX):
- **Protokoll-Fee:** ~0,25 % pro Shield/Unshield.
- **Relayer/Broadcaster:** ~**10 % über den reinen Gas-Kosten** (nicht über dem Zahlbetrag).
  Bei L2-Gas im Cent-Bereich ist das in absoluten Zahlen vernachlässigbar.
- **DFX-Marge (SaaS/Lizenz):** separat, ins Geschäftsmodell statt in jede Tx (§Konzept §7).

**Beispiel L2-Vollkosten einer 12,50-€-Zahlung (1×2):** Gas ~$0,02–0,15 + Relayer ~10 % davon
+ ggf. 0,25 % Protokoll ≈ **wenige Cent total**.

---

## 5. Skalierungs-Hebel (Wirkung auf diese Zahlen)

| Hebel | Wirkung |
|---|---|
| **Rekursive Proof-Aggregation** | N Zahlungen → 1 On-chain-Verify; Verify-Gas/Zahlung → nahe 0 (größter Kosten-Hebel) |
| **KZG/V3-artige Optimierungen** | Railgun nennt **30–70 % weniger Gas** für Shield/Unshield/Transfer |
| **Blobs (EIP-4844)** | L2-Data-Komponente stark gesenkt |
| **Multi-thread/native Prover** | Proof-Zeit 6 s → <1 s (selber Circuit) |
| **Kleine Stückelungen** | hält Zahlungen bei 1×2 statt 2×2/2×3 (Zeit + Gas) |
| **Aggregat-Settlement** | Unshield-Gas wird auf viele Zahlungen verteilt |

---

## 5b. Gemessen im PoC (lokales Devnet) — Off-chain-Insertion

Echte `transact`-Gaswerte aus dem PoC (`pnpm demo:gas`), Merkle-Tiefe 20:

| Design | transact gasUsed | on-chain Poseidon |
|---|---|---|
| **alt** (Insert pro Ebene on-chain) | **~1.74M – 1.80M** | ~40 Hashes/Tx |
| **neu** (Root-Transition im Proof) | **~350k (Pay) – 401k (Shield)** | **0** |

→ **~5× weniger Gas/Tx**, weil der Contract keine Poseidon-Hashes mehr rechnet — die
Insertion (oldRoot→newRoot, 2 Outputs als Paar-Knoten) wird **im zk-Proof** bewiesen. Der
Verifier-Verify (~300k) dominiert nun. Circuit: ~56.700 Constraints. Tradeoff: Txs bauen
strikt auf `currentRoot` auf → der Relayer serialisiert (stale → revert + neu bauen).

> Hinweis: gemessen auf lokalem Devnet (reine Execution-Gas). Auf L2 ist der absolute Preis
> Cent-Bereich; die ~5×-Reduktion verbessert v. a. Durchsatz/Headroom.

## 6. Von Schätzung zu Messung (To-do vor Produktion)

Diese Zahlen sind Referenz-Extrapolationen. Belastbar werden sie durch:

1. **Circuit-Prototyp** (1×2, 2×2) in Circom → echte Constraint-Zahl + Proof-Zeit auf
   Referenz-Geräten (iPhone Mid-Range, Android Mid-Range, Desktop) — single- vs. multi-thread.
2. **Verifier + Pool-Contract auf Testnet** (Base Sepolia / Arbitrum Sepolia) → reale
   `transact`/`shield`/`unshield`-Gas-Units via `eth_estimateGas` + tatsächliche L1-Data-Kosten.
3. **End-to-End-Messung** Scan→Proof→Submit→Confirm auf L2 → reale gefühlte Latenz.
4. Werte hier eintragen, „Schätzung" → „gemessen" markieren.

---

## 7. Fazit (eine Zeile pro Frage)

- **Langsamer?** Ja, ~1–3 s Proof bei 1×2 — durch Hintergrund-Proving gefühlt ≈ 0.
- **Mehr Transaktionen?** Nein pro Zahlung (1 Tx); einmaliges Shield amortisiert; Settlement gebündelt = weniger.
- **Teurer?** Auf den Ziel-L2 (Polygon/Base/Arbitrum) wenige **Cent** total (≈ gratis). Ethereum L1 wäre einstellige $ — deshalb L2-only.

---

### Quellen
- Groth16-Verify-Gas: [HackMD nebra](https://hackmd.io/@nebra-one/ByoMB8Zf6), [7BlockLabs](https://www.7blocklabs.com/blog/whats-the-cleanest-way-to-optimize-an-on-chain-groth16-verifier-so-each-proof-costs-under-100k-gas), [evm-groth16](https://github.com/recmo/evm-groth16)
- Railgun Fees/Optimierungen: [Costs & Fees](https://docs.railgun.org/community-faqs/readme/costs-and-fees), [v3-Architektur](https://medium.com/@Railgun_Project/the-new-architecture-for-ethereum-privacy-introducing-railgun-v3-21e111fa297e)
- Proof-Zeit/Constraints: [arxiv 2301.00823](https://arxiv.org/pdf/2301.00823), [zk.email tooling](https://zk.email/blog/zk)
- L2-Gas: [arbiscan Gastracker](https://arbiscan.io/gastracker), [ethgastracker Arbitrum](https://www.ethgastracker.com/network/arbitrum)
- ETH-Preis: [metamask](https://metamask.io/price/ethereum), [fortune 11.06.2026](https://fortune.com/article/price-of-ethereum-06-09-2026/)
