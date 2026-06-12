# Cloister — Security & Audit

> Adversarialer Audit (Solidity + zk-Circuits + Protokoll/Ökonomie) plus die daraus
> umgesetzten Härtungen. Stand der Umsetzung unten je Befund markiert.
>
> ⚠️ **Cloister ist weiterhin nicht produktionsreif für echtes Geld.** Vor einem Mainnet-Launch
> braucht es zwingend: eine echte Multi-Party-Ceremony, zwei unabhängige externe Audits
> (Circuits + Contracts) und die im Code noch fehlende Compliance-Schicht. Siehe
> [`PRODUCTION_READINESS.md`](PRODUCTION_READINESS.md).

## Threat-Model (Kurz)

Ein Shielded Pool muss drei Dinge garantieren: **(1) keine Wertschöpfung aus dem Nichts**
(Soundness von Circuit + Trusted Setup), **(2) kein Double-Spend** (Nullifier), **(3) keine
Deanonymisierung des Zahlers**. Die größte Angriffsfläche ist nicht nur Solidity, sondern
Circuits + Verifier + Trusted Setup. Alle drei wurden geprüft.

## Befunde & Status

| # | Befund | Schwere | Status |
|---|--------|---------|--------|
| C-1 | **Reentrancy/CEI** in `_transact`: Token-Transfers vor State-Update → Hook-Token (ERC-777/1363) kann den Pool mit demselben Proof leersaugen | 🔴 Kritisch | ✅ **Behoben** — `ReentrancyGuard` + strikte Checks-Effects-Interactions + `SafeERC20`. Test: `reentrancy` |
| C-2 | **Trusted Setup** war Single-Contributor mit **hartcodierter Entropie** im Repo → toxic waste rekonstruierbar → jeder Proof fälschbar | 🔴 Kritisch | ⚠️ **Tooling behoben** (frische Krypto-Entropie + Beacon + `zkey verify`); für Mainnet ist eine **echte Multi-Party-Ceremony** weiterhin Pflicht |
| H-3 | **BabyJubJub-Skalar nicht reduziert**: `s` und `s+order` ergeben dieselbe Note, aber verschiedene Nullifier → Self-Double-Spend (Mint) | 🔴 Kritisch | ✅ **Behoben** — `privateKey < Untergruppenordnung` im Circuit (`keypair.circom`) erzwungen |
| H-1 | **Kein SafeERC20 / Fee-on-Transfer** → USDT-Brick & Pool-Insolvenz | 🟠 Hoch | ✅ **Behoben** — `SafeERC20` + Deposit-Balance-Delta (Fee-on-Transfer wird hart abgelehnt). Tests: `ERC20 safety` |
| H-2 | **Keine Root-History** → ein Angreifer front-runt jede Lane mit 1-Wei-Tx und invalidiert alle schwebenden Proofs (Liveness-Griefing) | 🟠 Hoch | ⏳ **Offen** — sauberer Fix braucht Circuit-Split (Membership-Root ≠ Insertion-Root); als nächstes Arbeitspaket dokumentiert |
| M-2 | **PoolRegistry-Owner** kann jedes `(chain,asset)→pool` still überschreiben | 🟠 Hoch (Prozess) | ✅ **Gehärtet** — `Ownable2Step`, Zero-Checks, append-only `register`, separates `migrate` mit old/new-Event; Owner sollte Multisig+Timelock sein |
| D-2 | **Config-Server** liefert unauthentifiziert Pool-/Empfänger-Adressen, denen die Wallet vertraut | 🟠 Hoch (Prozess) | ⏳ **Offen** — signierte Config + gepinnte Adressen empfohlen (Doku) |
| M-1a | **`publicAmount` nicht in-circuit range-checked** | 🟡 Mittel | ✅ **Verifiziert sicher** — durch Werterhaltung `sumIn+publicAmount===sumOut` + 248-Bit-Range-Checks transitiv gebunden; kein Field-Wraparound-Mint möglich |
| M-1b | **uint32-Leaf-Index-Truncation** bei großem `levels` | 🟡 Mittel | ✅ **Behoben** — Constructor-Guard `numLanes<<levels ≤ uint32` |
| C-1z | **Dummy-Zero-Input-Nullifier** vom Prover frei wählbar | 🟡 Mittel (latent) | ✅ **Eingegrenzt** — nicht value-forging (an eigenen Key gebunden); zusätzlicher Contract-Guard `in0≠in1`; Kanonisierung optional |
| L-1 | **Kein Pause/Emergency** | 🟢 Niedrig | ✅ **Behoben** — Guardian kann **nur Einzahlungen** pausieren; Auszahlungen sind nie blockierbar (Gelder nie eingefroren) |
| L-2 | **Constructor ohne Zero-/Range-Checks** | 🟢 Niedrig | ✅ **Behoben** — verifier/token≠0, levels∈[1,32], initialRoot<FIELD |
| B-1 | **„Compliant"-Schicht existiert im Code nicht** (ASP/Association-Sets/Viewing-Keys) | 🟠 Hoch (Produkt) | ⏳ **Offen** — heute aspirational; muss vor jedem „compliant"-Pitch in den Circuit |

## Verifiziert SICHER (kein Fix nötig)

- **Werterhaltung:** `sumIn + publicAmount === sumOut` mit 248-Bit-Range-Checks auf allen
  Beträgen → kein Field-Wraparound-Mint (worst case `3·2^248 ≪ p`).
- **Empfänger/Fee-Bindung:** `extDataHash = keccak256(abi.encode(extData))` als Public-Input →
  ein Relayer/Front-Runner kann Empfänger/Fee/Betrag nicht ändern und den Proof wiederverwenden.
- **Nullifier:** Poseidon-PRF aus (commitment, pathIndices, sig) — non-malleable, vermeidet
  korrekt das EdDSA-Double-Spend; In-Tx-Distinktheit im Circuit erzwungen.
- **Off-chain-Insertion:** `oldPair==H(0,0)` / `newPair==H(out0,out1)` mit gemeinsamen
  Geschwistern + vom Contract gepinntem `pairIndex` → kein Überschreiben belegter Leaves.
- **Verifier:** prüft alle Public-Signals `< r`; Standard-Groth16, non-malleable.

## Umgesetzte Härtungen (dieser Stand)

**Contracts** (`ShieldedPool.sol`, `PoolRegistry.sol`):
`ReentrancyGuard` + strikte CEI · `SafeERC20` für alle Transfers · Deposit-Balance-Delta gegen
Fee-on-Transfer · `in0≠in1`-Guard · Constructor-Validierung (verifier/token/levels/index-space/
initialRoot) · Guardian-Pause **nur für Einzahlungen** · `Ownable2Step` + append-only Registry
mit sichtbarem `migrate`. Tests: [`test/ShieldedPool.guards.test.js`](../packages/contracts/test/ShieldedPool.guards.test.js).

**Circuits** (`keypair.circom`): `privateKey < Untergruppenordnung` → schließt den
Skalar-Double-Spend.

**Trusted Setup** (`scripts/build.mjs`): keine hartcodierte Entropie mehr — frische
Krypto-Entropie (`CEREMONY_ENTROPY` überschreibbar) + Verifiable-Beacon-Finalisierung
(`CEREMONY_BEACON`) + `zkey verify`. **Für Mainnet: echte Multi-Party-Ceremony.**

## Vor Mainnet noch offen (Pflicht)

1. **Multi-Party Trusted-Setup-Ceremony** mit unabhängigen Beitragenden + veröffentlichtem
   Transcript (das Tooling steht; die Ceremony selbst ist organisatorisch).
2. **Zwei unabhängige externe Audits** (Circuits + Contracts).
3. **Root-History** (Circuit-Split) gegen Liveness-Griefing (H-2).
4. **Compliance-Schicht im Circuit** (ASP-Inclusion + Viewing-Key-Disclosure) für jeden
   „compliant"-Claim (B-1).
5. **Signierte Config / gepinnte Pool-Adressen** in der Wallet (D-2).
6. **Privacy-Budget** dokumentieren: öffentlicher Withdraw-Betrag, Lane-Index-Leak,
   Timing/IP gegenüber dem Relayer (P1–P4).
