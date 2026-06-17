# Cloister — Architektur

Cloister ist ein konformer **Shielded Pool** mit verschlüsselten UTXOs für EVM-Chains: eine
Privacy-Schicht, die es einem Zahler erlaubt, eine Zahlung abzuwickeln, ohne die On-Chain-Verknüpfung
zwischen seinen Mitteln und dem Empfänger offenzulegen — und dabei dennoch in Zero Knowledge zu beweisen,
dass die Mittel zu einer Compliance-„Good-Set" gehören (dem Association-Set-Provider, ASP). Cloister ist
ein eigenständiges DFX-Produkt; OpenCryptoPay ist die erste Integration, das Protokoll selbst ist jedoch
unabhängig vom Zahlungs-Rail.

> Dieses `docs/en/`-Set dokumentiert das **tatsächlich umgesetzte gnark-System**. Die deutschen
> `docs/*.md` sind die Dokumente der Entwurfsphase und können sich noch auf das abgelöste circom-Design
> beziehen.

## System auf einen Blick

```
        ┌────────────────────────────────────────────────────────────┐
        │  Wallet (React Native / Expo)                                │
        │   ┌──────────────┐   witness     ┌──────────────────────┐    │
        │   │ @cloister/sdk│ ───────────▶  │ cloister-prover      │    │
        │   │ notes/tree   │  (Poseidon2)  │ (native gnark, on-   │    │
        │   │ buildWitness │ ◀───────────  │  device Groth16)     │    │
        │   └──────┬───────┘  proof+pub     └──────────────────────┘    │
        │          │ submitShielded()                                   │
        └──────────┼──────────────────────────────────────────────────┘
                   │ proof + calldata (NO witness — privacy preserved)
                   ▼
        ┌────────────────────┐        ┌───────────────────────────────┐
        │ Relayer (api)      │        │ Indexer (indexer)             │
        │ broadcast-only     │        │ NewCommitment events → tree    │
        │ pays gas, hides    │        │ view-tag filtered discovery    │
        │ sender             │        └───────────────────────────────┘
        └─────────┬──────────┘
                  ▼ transact()
        ┌────────────────────────────────────────────────────────────┐
        │ ShieldedPool.sol  (+ TransactionVerifier = gnark Groth16)    │
        │ lanes · nullifier set · off-chain Merkle insertion · ASP     │
        └────────────────────────────────────────────────────────────┘
```

## Komponenten

### `packages/prover-gnark` (Go; Apache-2-Abhängigkeiten; MIT-Code)
Die gesamte Zero-Knowledge-Schicht, selbst gebaut auf Basis von **gnark / gnark-crypto**:
- `zk/` — Poseidon2-Hash (nativ == in-circuit, nachgewiesen durch `hash_test`), das kurvenfreie
  Note-Schema (`pubKey = H(privKey)`), der Merkle-Baum mit fester Tiefe (2²⁰) sowie der
  `TxCircuit` (2-in/2-out: Pool-Zugehörigkeit, ASP-Compliance, Werterhaltung, Nullifier-
  Eindeutigkeit, Off-Chain-Insertion).
- `prover/` — wiederverwendbare Proving-Bibliothek (`Load(keys)` einmalig → `Prove`).
- `mobile/` — gomobile-Binding (`Cloister.xcframework`) für das On-Device-Proving.
- `cmd/setup` — Groth16-Setup → Keys + exportierter MIT-Solidity-Verifier.
- `cmd/proverd` — HTTP-Prover für Dev/CI/Node (KEIN Produktionspfad; siehe PRIVACY).

### `packages/contracts` (Solidity; MIT / OpenZeppelin)
- `ShieldedPool.sol` — der Pool. Hält `numLanes` unabhängige Merkle-Roots (Parallelität),
  ein globales Nullifier-Set (Double-Spend-Schutz über Lanes hinweg) sowie das ASP-Compliance-Gate.
  Der Root-Übergang `oldRoot → newRoot` wird in-circuit bewiesen, sodass der Vertrag **kein
  On-Chain-Poseidon** ausführt (≈5× Gas-Ersparnis — „Off-Chain-Insertion").
- `Groth16Verifier.sol` — von gnark exportierter Verifier (MIT).
- `TransactionVerifier.sol` — `(a,b,c)`-Struct-Adapter über dem gnark-Verifier.
- `PoolRegistry.sol` — `chainId+asset → pool`, 2-Step-owned, append-only, sichtbare Migration.

### `packages/sdk` (JS; MIT-kompatible Abhängigkeiten)
Keys, Notes, Merkle-Baum, Note-Verschlüsselung (nacl box + View-Tags), `buildWitness`, das
einsteckbare Krypto-**Backend** (natives Modul auf dem Gerät, `proverd` in Dev), die robuste
**Submit**-Schicht sowie die Indexer-/Chain-**Synchronisation** mit Fallback.

### `packages/api` (Relayer) und `packages/indexer`
Das `/v1/shielded/submit` des Relayers ist **broadcast-only**: Es akzeptiert einen fertigen Proof +
Calldata, zahlt Gas und reicht ein, wobei die Adresse des Nutzers verborgen bleibt. Es bekommt den
Witness nie zu sehen. Der Indexer wandelt `NewCommitment`-Events in einen Baum um und bietet eine
nach View-Tags gefilterte Discovery.

### `dfx-wallet/modules/cloister-prover` (natives Modul)
Ein lokales Expo-Modul, das `Cloister.xcframework` kapselt und `initProver / hash / prove` für JS
bereitstellt. Die Proving-Keys werden im App-Bundle ausgeliefert; der Witness verlässt das Gerät nie.

## Zentrale Designentscheidungen

| Entscheidung | Begründung |
|----------|-----|
| **gnark (statt circom/snarkjs)** | Apache-2 (kein GPL); nativer Prover ~8× schneller als WebView-snarkjs |
| **Poseidon2** | ein Hash für nativ + in-circuit; kleinerer Circuit (50,481 Constraints) |
| **kurvenfreier pubKey `H(priv)`** | eliminiert strukturell die BabyJubJub-Skalar-Self-Double-Spend-Klasse |
| **Off-Chain-Merkle-Insertion** | Proof trägt `oldRoot→newRoot`; Vertrag rechnet kein Poseidon → ~5× Gas |
| **Lanes** | unabhängige Roots → parallele Txs in einem Block; globales Nullifier-Set wahrt die Sicherheit |
| **ASP-Compliance-Root** | 10. Public Signal; jeder reale Input wird als ∈ Good-Set bewiesen |
| **On-Device-Proving** | Privacy (Witness verlässt das Gerät nie) + funktioniert offline |
| **broadcast-only Relayer** | Liveness + Sender-Privacy, ohne dass der Relayer Geheimnisse erfährt |

## Lebenszyklus einer Transaktion

1. Die Wallet baut den Witness aus lokalen Notes + Baumpfaden (Poseidon2 über das native Modul).
2. Der native Prover erzeugt einen Groth16-Proof + 10 Public Signals on-device (im Sub-Sekunden-Bereich).
3. `submitShielded` sendet Proof + Calldata an einen Relayer (idempotent, mit Fallback).
4. `ShieldedPool.transact` leitet die Public Signals erneut ab, ruft den Verifier auf und gibt
   bei Erfolg die Nullifier aus, emittiert die neuen Commitments und schiebt den Lane-Root vor.
5. Der Indexer beobachtet `NewCommitment`; die Empfänger-Wallets entdecken ihre Note über View-Tags.

Siehe `SECURITY.md`, `PRIVACY.md`, `CIRCUIT.md`, `FALLBACKS.md`, `INTEGRATION.md`, `VALIDATION.md`.
