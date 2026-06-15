# Cloister — Technische Architektur

> Vertiefung zu `CONCEPT.md`. Designentscheid: **Privacy-Pools-Fork (compliant, ASP-nativ)
> mit Railgun-Patterns** (encrypted-UTXO-Modell, Broadcaster-Netz, Viewing-Keys),
> Privacy-Tiefe **inkl. Betrags-/Timing-Verschleierung (Stufe 2)**.

Stand: 2026-06-12 · Status: Design v0.1 · Scope: EVM, chain-agnostisch

---

## 0. Designgrundlagen aus der Referenz-Tech

| System | Was wir übernehmen | Quelle |
|---|---|---|
| **Privacy Pools** (Buterin/Soleimani, 0xbow) | Compliance über **Association Sets**: zk-**Inclusion**-Proof („mein Deposit ∈ freigegebenes Set") bzw. **Exclusion**-Proof („nicht ∈ Bad-Set"), validiert durch einen **Association-Set-Provider (ASP)** off-chain. | docs.privacypools.com, 0xbow.io |
| **Railgun** | **Encrypted-UTXO**-Modell (keine fixen Denominationen), **Groth16** über BN254, **Poseidon**-Hashing, **BabyJubJub**-Keys, **Viewing-Keys** zum Event-Scan, **Broadcaster/Relayer**-Netz das Gas zahlt, **Private Proofs of Innocence**. | docs.railgun.org |

Wir bauen also einen **compliant encrypted-UTXO Shielded Pool**: das Anonymitäts-Modell von
Railgun + die regulatorische Schicht von Privacy Pools.

---

## 1. Threat-Model

**Akteure**
- *Zahler* (will P1/P2: Unlinkability, kein Vermögens-Leak).
- *Händler / POS* — kennt Quote & Kassenpreis, soll Zahler-Wallet nicht erfahren.
- *On-chain-Beobachter / Chain-Analyst* — sieht alle Pool-Txs.
- *DFX (Settlement-Broker)* — kennt Händler/Quote/Betrag, soll Zahler-Identität **nicht**
  erfahren.
- *Relayer/Broadcaster* — semi-trusted: kann zensieren, nicht stehlen, lernt keine Identität.
- *ASP / Regulator* — darf bei berechtigtem Anlass über Viewing-Key selektiv offenlegen.

**Garantien**
- **P1 Unlinkability:** Pay-Tx kommt von Pool/Relayer; `from` ≠ Zahler. Anonymitäts-Set =
  alle Pool-Teilnehmer mit kompatiblen Notes.
- **P2 Kein Vermögens-Leak:** Notes sind Commitments; Guthaben/weitere Wallets nicht
  ableitbar.
- **P3 Betrag/Timing (Stufe 2):** On-chain nur Aggregat-Beträge an DFX; Einzelbetrag &
  -timing nicht korrelierbar (s. §6).

**Explizit außerhalb**
- DFX bleibt Settlement-Intermediär (kennt Betrag fürs Fiat-Settlement). „Auch-DFX-trustless"
  ist v2-Forschung.
- Netzwerk-Layer (IP) — adressiert durch Relayer + optional Tor/Mixnet, kein Krypto-Garant.
- On-/Off-Ramp-Korrelation außerhalb des Pools (Exchange-KYC etc.).

---

## 2. Schlüssel-Hierarchie

Pro Nutzer, abgeleitet aus einem Master-Seed (BIP-39-kompatibel, separater Ableitungspfad,
damit das normale EVM-Wallet getrennt bleibt):

```
masterSeed
 ├─ spendingKey   (BabyJubJub)  → autorisiert Spends (nullifier-Ableitung)
 ├─ viewingKey    (BabyJubJub)  → entschlüsselt eigene Notes / Event-Scan / selektive Disclosure
 └─ shieldAddress = (spendPub, viewPub)  → öffentlich teilbare „Shielded Address"
```

- **Spending-Key** signiert nie on-chain sichtbar — er geht nur in den zk-Witness ein.
- **Viewing-Key** ist read-only und separat teilbar (Steuer, Audit, ASP-Disclosure) ohne
  Spend-Rechte.
- Recovery: Notes sind aus dem Seed + Chain-History rekonstruierbar (Event-Scan mit
  Viewing-Key) → kein zusätzliches Backup nötig, aber optionaler verschlüsselter
  Note-Cache für schnellen Sync.

---

## 3. Note-/UTXO-Modell

**Note** (privater Besitz-Eintrag):
```
note = { value, assetId, owner=shieldAddress.spendPub, blinding }
commitment = Poseidon(value, assetId, ownerPub, blinding)
```
- Commitments hängen in einem **inkrementellen Merkle-Tree** (Poseidon, Tiefe 32 →
  ~4 Mrd. Notes) pro `(chainId, pool)`.
- **Nullifier** beim Spend: `nullifier = Poseidon(commitment, leafIndex, spendingKey)`.
  On-chain in einem Nullifier-Set gespeichert → Double-Spend unmöglich, ohne zu verraten
  *welches* Commitment ausgegeben wurde.
- **Encrypted Memo:** `enc = AEAD(sharedSecret = ECDH(viewPub_recipient, ephemeral), {value,
  assetId, blinding})`. So findet der Empfänger (bzw. DFX bei der Payment-Note) seine Note
  beim Event-Scan und kennt den Betrag — on-chain steht nur Ciphertext.

Multi-Asset: `assetId` ist Teil des Commitments; ein Pool verwaltet mehrere Assets, Anonymität
teilt sich aber pro Asset (gleiche `assetId` = gleiches Anonymitäts-Set).

---

## 4. Circuits (Groth16 / BN254 / Poseidon)

Parametrisiert nach (#Inputs, #Outputs), wie bei Railgun (Familie kleiner Circuits, z. B.
1×2, 2×2, 2×3, 8×2). Zentrale Constraints des **Transact-Circuits**:

**Private inputs:** Notes (value, blinding, leafIndex, Merkle-Pfade), spendingKey,
Output-Notes (value, blinding, ownerPub).
**Public inputs:** `merkleRoot`, `nullifiers[]`, `outputCommitments[]`, `publicRecipient`,
`publicAmount`, `assetId`, `aspRoot`, `feeCommitment`.

Beweist:
1. **Membership:** jedes Input-Commitment liegt unter `merkleRoot` (Merkle-Proof).
2. **Ownership:** `nullifier` korrekt aus `spendingKey` abgeleitet (Besitz).
3. **Balance:** `Σ inputs == Σ outputCommitments.value + publicAmount + fee` (Werterhaltung,
   keine Inflation; Range-Checks gegen Overflow/negative).
4. **Authorisierung:** `publicRecipient`/`publicAmount` an den Proof gebunden → Relayer kann
   Ziel/Betrag nicht ändern.
5. **Compliance (ASP):** Input-Deposits ∈ `associationRoot` (Inclusion) bzw. ∉ Bad-Set
   (Exclusion) — Merkle-Proof gegen einen vom ASP signierten Root (§5).

Trusted Setup: zirkulärer Phase-2-Setup pro Circuit (Powers-of-Tau wiederverwenden). Prover
clientseitig (WASM/native) — Mobil-Perf via kleinen Input-Counts + Server-fallback-Prover
für schwache Geräte (optional, mit Privacy-Tradeoff dokumentiert).

---

## 5. Compliance-Layer (ASP)

- **DFX als ASP**: Da Deposits idealerweise aus dem DFX-Onramp (KYC) kommen, ist der
  „Good-Set" natürlich gegeben. DFX publiziert periodisch einen signierten
  **`associationRoot`** (Merkle-Root aller freigegebenen Deposit-Commitments).
- **Inclusion-Proof** (Default): Zahler beweist im Circuit, dass seine Quell-Deposits unter
  `associationRoot` liegen — ohne zu zeigen welche. → Zahlung ist beweisbar „sauberes Geld",
  ohne Identität.
- **Exclusion-Proof** (Alternative für permissionless Deposits): beweist Nicht-Mitgliedschaft
  in einem Bad-Set (Sanktionslisten, geflaggte Adressen).
- **Viewing-Key-Disclosure:** Auf berechtigtes Verlangen kann ein Nutzer (oder DFX qua
  Onramp-KYC) die eigene Historie offenlegen — selektiv, nicht global. Das ist der Hebel,
  der „Privacy" von „Geldwäsche-Tool" trennt und DFX den regulierten Betrieb erlaubt.
- **Private Proofs of Innocence (PPOI)** als zusätzlicher Default: jede Note trägt einen
  Nachweis, dass sie nicht aus geflaggten Quellen stammt — verhindert „Vergiftung" des Pools.

---

## 6. Betrags- & Timing-Privacy (Stufe 2)

Problem: Selbst wenn der Zahler verborgen ist, sieht ein Beobachter der DFX-Adresse, dass
„660.72 µETH" eintrifft, und kann das mit einem Kassenpreis korrelieren.

**Lösung: Aggregat-Settlement statt 1:1-Auszahlung.**

- Der Pay-Spend erzeugt **keinen** direkten On-chain-Transfer an die DFX-EOA. Stattdessen
  eine **Payment-Note an DFXs Shielded-Address** (verschlüsselt; nur DFX entschlüsselt
  Betrag/Quote-Bindung via Viewing-Key).
- Quote-Erfüllung wird DFX über den **verschlüsselten Memo** (`quoteId`, `value`)
  nachgewiesen — off-chain decryptbar, on-chain nur Ciphertext.
- DFX **unshieldet gebündelt** (z. B. stündlich oder schwellenbasiert) einen Aggregat-Betrag
  vieler Zahlungen in einer einzigen Tx. → On-chain erscheinen nur Lumps ohne Bezug zu
  einzelnen Quotes/Zeitpunkten.
- Ergänzend: **feste Denominations-Buckets** + Decoy-Outputs verflachen
  Betrags-Fingerprints; randomisierte Relayer-Submit-Delays brechen Timing-Korrelation
  zwischen Kassen-Scan und On-chain-Erscheinen.

**Tradeoff:** Settlement-Latenz & Vertrauensfenster gegenüber DFX wachsen (DFX hält kurz
Pool-internes Guthaben). Akzeptabel, weil DFX im OCP-Modell ohnehin Settlement-Broker ist.
Optionaler „instant"-Modus (1:1-Unshield) für Händler, die Timing-Privacy nicht brauchen.

---

## 7. Relayer / Broadcaster-Netz

- Akzeptiert Meta-Transaktion (Proof + Calldata), broadcastet, **zahlt Gas**. Fee als
  `feeCommitment` im Proof gebunden, aus dem Shielded-Betrag bezahlt → Zahler braucht
  **kein gas-finanziertes (deanonymisierendes) Konto**.
- Kann nicht stehlen/umleiten (Recipient/Betrag im Proof). Kann zensieren → mehrere Relayer +
  Fallback „self-broadcast" (mit Privacy-Hinweis).
- DFX betreibt das Default-Relayer-Set als Teil des Managed Service; White-Label-Lizenznehmer
  fahren eigene. Relayer-Discovery über die Registry (§8).

---

## 8. Chain-Fokus (L2-only) & Registry

- **Zielketten: Polygon, Base, Arbitrum** — die großen, günstigen L2. **Ethereum L1 ist kein
  Ziel** (Shielded-Tx kostet dort Dollar statt Cent, s. `BENCHMARK.md`).
- Identische Contracts + einmal kompilierte Circuits pro L2 deploybar — deckt sich mit den
  heutigen L2-`transferAmounts`. Weitere L2 (z. B. Optimism) später additiv.
- **On-chain/Off-chain Registry** `chainId → { poolAddress, verifierAddress, assetList,
  aspRoot-Feed, relayerEndpoints }`.
- Pro Chain eigenes Anonymitäts-Set; Cross-Chain-Korrelation vermieden (Quotes & Pools
  unabhängig). Bridging zwischen Pools ist **nicht** im Scope (würde Linkage schaffen).

---

## 9. OpenCryptoPay-Protokoll-Erweiterung „Shielded Methods"

Additiv, rückwärtskompatibel. Schritte 1–2 (LNURL-Decode, Payment-Details) **unverändert**.

**§9.1 `transferAmounts`-Erweiterung**
```jsonc
{
  "method": "Base",
  "shielded": true,                 // NEU: Pool-Variante verfügbar
  "shieldedPool": "0xPool…",        // NEU
  "assets": [{ "asset": "USDC", "amount": "12.50", "shielded": true }]
}
```
Wallets ohne Shield-Support ignorieren das Flag und nutzen den klassischen EOA-Flow.

**§9.2 Tx-Details-Callback (Schritt 3)**
Bei gewählter shielded Method liefert der Callback statt einer EIP-681-EOA-URI ein
**Pool-Instruktions-Objekt**:
```jsonc
{
  "blockchain": "Base",
  "shieldedPool": "0xPool…",
  "recipientShieldAddress": "ocps1…",   // DFX Shielded-Address (Payment-Note-Ziel)
  "publicAmount": "0",                    // 0 = vollständig in Pool (Stufe-2-Aggregat)
  "quoteId": "plq_…",
  "merkleRootHint": "0x…",
  "relayers": ["https://relay1…", "…"],
  "expiryDate": "…"
}
```

**§9.3 Submit (Schritt 5)**
Statt rohem Signed-Tx-Hex reicht das Wallet das **Proof-Bundle** beim Relayer ein, der an
DFXs Submit-API broadcastet:
```
POST {relayer}/v1/shielded/submit
{ chainId, proof, publicSignals, encryptedMemo, quoteId }
```
DFX validiert Proof gegen `verifier` + `aspRoot`, ordnet via `quoteId` dem Händler zu,
settled wie gewohnt. **Das eingereichte Artefakt enthält keine Zahler-Adresse.**

→ Kandidat für einen eigenen Abschnitt „Shielded Methods" im offenen OCP-Standard
(Stufe 4 der Roadmap).

---

## 10. End-to-End-Sequenz (EVM, shielded)

```
Vorab (1×):  Onramp/Deposit → Shield → Note im Pool (öffentlich: DFX→Pool, nicht Nutzer→Pool)

Kasse:
 1. QR scannen → LNURL decode                          (unverändert)
 2. GET payment details → recipient/quote/transferAmounts (mit shielded:true)
 3. GET tx details (method=Base, shielded) → Pool-Instruktion §9.2
 4. Wallet:
      - wählt Input-Notes, baut Output-(Change+Payment-)Notes
      - generiert Groth16-Proof (Balance, Membership, Nullifier, ASP-Inclusion)
      - verschlüsselt Payment-Memo an DFX-ShieldAddress
 5. Relayer broadcastet transact() → Pool                (Gas vom Relayer)
      on-chain sichtbar: nullifiers, neue commitments, aspRoot — KEIN Zahler
 6. DFX scannt Event, entschlüsselt Memo (quoteId,value), bestätigt Quote
 7. DFX Aggregat-Unshield (Stufe 2, später/batched) → Fiat/Krypto-Settlement an Händler
```

---

## 11. Angriffsflächen & Gegenmaßnahmen

| Vektor | Maßnahme |
|---|---|
| Kleines Anonymitäts-Set (frischer Pool) | Onramp-Käufe default in Pool; Denomination-Buckets; Mindest-Set-Größe pro Asset überwachen |
| Betrags-Fingerprint an DFX-EOA | Aggregat-Unshield (§6), Decoys, Buckets |
| Timing-Korrelation Scan↔Chain | Randomisierte Relayer-Delays, Batching |
| IP-Deanonymisierung | Relayer-Pflicht + optional Tor; keine Direkt-Calls des Wallets an DFX-API im shielded Flow |
| Relayer-Zensur | Multi-Relayer, self-broadcast-Fallback |
| Toxic-Deposit / Pool-Vergiftung | ASP Exclusion + PPOI Default |
| Trusted-Setup-Kompromiss | Multi-Party Phase-2-Ceremony, öffentlich verifizierbar |
| Note-Verlust | Seed-basierte Rekonstruktion via Viewing-Key-Event-Scan |
| Quote-Replay / Doppel-Settlement | `quoteId`-Bindung im Memo + Nullifier-Set + DFX-seitige Quote-Einlösung idempotent |

---

## 12. Komponenten-Inventar (für Scaffold)

```
contracts/        Pool (Merkle, nullifier-set, transact/shield/unshield), Verifier, Registry
circuits/         transact_*.circom (Familie), shield/unshield, ASP-inclusion; Poseidon, BN254
sdk/              Key-Ableitung, Note-Mgmt, Proof-Gen (WASM), Event-Scan, OCP-Client-Erweiterung
relayer/          Meta-Tx-Annahme, Gas-Mgmt, Multi-Chain, Discovery
asp/              Good/Bad-Set-Pflege, Root-Signing, Viewing-Key-Disclosure-Dashboard
integration/      OCP transferAmounts-Erweiterung, Submit-API-Adapter
```

---

## 13. Offene Punkte vor Stufe-0-PoC

- **Asset-/Decimals-Normalisierung** über Chains (USDC 6 vs. 18 Decimals) im Commitment.
- **Genaue ASP-Governance:** Frequenz/Signatur des `associationRoot`, Notfall-Freeze.
- **Mobil-Prover-Budget** messen (Proof-Zeit 1×2 vs. 2×3 auf Mid-Range-Phone).
- **Legal-Review** des ASP-/Viewing-Key-Modells (CH/EU) — vor Code.
- **Settlement-Vertrauensfenster** der Aggregat-Variante mit DFX-Treasury abstimmen.
