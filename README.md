# Cloister Protocol (PoC)

Privacy-Layer für [OpenCryptoPay](https://github.com/openCryptoPay): ein **compliant
encrypted-UTXO Shielded Pool**, der bei Kassenzahlungen die Verknüpfung *Wallet ↔ Zahlung*
bricht. Niemand (Händler, On-chain-Beobachter, selbst der Settlement-Broker) erfährt die
Zahler-Adresse oder kann daraus Guthaben/weitere Wallets/Vermögen ableiten.

> ⚠️ **Status: Proof of Concept — NICHT produktionsreif.** Lokaler Single-Contributor
> Trusted-Setup, kein Audit, vereinfachtes Schlüssel-/Compliance-Modell. Siehe
> [Grenzen & nächste Schritte](#grenzen--nächste-schritte). Konzept & Architektur:
> [`docs/CONCEPT.md`](docs/CONCEPT.md), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md),
> [`docs/BENCHMARK.md`](docs/BENCHMARK.md).

## Was der PoC beweist

- **Payer-Privacy (P1/P2):** eine Zahlung wird per zk-SNARK ausgegeben und vom **Relayer**
  broadcastet — die Zahler-Adresse taucht weder als `tx.from` noch im Calldata auf.
- **Volle Abschirmung der Zahlung (Stufe 2):** die interne Zahlung an DFX bewegt **keinen
  Token on-chain** (Payment-Note statt Transfer); erst DFX unshieldet beim Settlement.
- **Korrektheit:** Werterhaltung, Nullifier (kein Double-Spend), Merkle-Membership und
  On-chain-Groth16-Verifikation — Bilanz stimmt über Shield → Pay → Settle.
- **Offene Integration:** der OCP-Flow wird über die additive „Shielded Methods"-Erweiterung
  (`transferAmounts.shielded`) abgewickelt — per HTTP-API + SDK, ohne DFX-Lock-in.
- **Skalierbares Gas:** Off-chain-Insertion — der Contract rechnet **0 Poseidon on-chain**,
  die Merkle-Root-Transition wird im Proof bewiesen → **~350k statt ~1.74M Gas/Tx (~5×)**.
- **Schnelle Note-Discovery:** Indexer + View-Tags filtern Fremd-Notes ohne Voll-Decrypt.
- **Paralleler Durchsatz:** `numLanes` unabhängige Roots — Zahlungen in verschiedenen Lanes
  landen gemeinsam in einem Block (im PoC 6/6), nur same-lane serialisiert.

## Architektur (Monorepo)

| Paket | Inhalt |
|---|---|
| `packages/circuits` | Circom-Circuits (transact 2×2, Poseidon/Groth16), Build + lokaler Setup |
| `packages/contracts` | `ShieldedPool` (Off-chain-Insertion + Lane-Parallelisierung), generierter Verifier, Registry, Mock-USDC (Hardhat) |
| `packages/sdk` | Keys (BabyJubJub-Pubkey), Notes, Merkle-Tree, Note-Verschlüsselung (nacl) + View-Tags, Proof-Gen, Chain-/Indexer-Sync, OCP-Client |
| `packages/api` | Mock-OpenCryptoPay-Provider + Relayer (Shielded-Methods-Endpoints §9) |
| `packages/indexer` | Commitment-Indexer mit View-Tags (schnelle Note-Discovery) |
| `apps/demo` | E2E-Demos (direkt, über HTTP-API, mit Indexer/View-Tags) |

## Voraussetzungen

- Node ≥ 20, `pnpm`
- `bin/circom` (macOS-amd64-Binary liegt im Repo; läuft auf arm64 via Rosetta)

## Setup

```bash
pnpm install
pnpm build:circuits      # kompiliert Circuit, lädt ptau, Groth16-Setup, exportiert Verifier
```

## Ausführen

**A) Direkter E2E-Flow** (Shield → private Zahlung → Settlement):

```bash
pnpm node                # Terminal 1: lokales Hardhat-Devnet (127.0.0.1:8545)
pnpm demo                # Terminal 2
```

**B) Voller HTTP-Flow** über die OCP-API + Relayer:

```bash
pnpm node                # Terminal 1
pnpm api                 # Terminal 2: Mock-Provider + Relayer (127.0.0.1:8788)
pnpm demo:api            # Terminal 3
```

**C) Note-Discovery** über Indexer + View-Tags:

```bash
pnpm node                # Terminal 1
pnpm api                 # Terminal 2
pnpm indexer             # Terminal 3: Commitment-Indexer (127.0.0.1:8789)
pnpm demo:indexer        # Terminal 4 — zeigt, wie der View-Tag Fremd-Notes ohne Decrypt verwirft
```

**Gas-Messung** (Off-chain-Insertion vs. altes Design):

```bash
pnpm node                # Terminal 1
pnpm demo:gas            # Terminal 2 — zeigt ~350k statt ~1.74M Gas/Tx
```

**Parallelisierung** (mehrere Lanes landen gemeinsam):

```bash
pnpm node                # Terminal 1
pnpm demo:parallel       # Terminal 2 — 6 Zahlungen über 6 Lanes in EINEM Block; same-lane serialisiert
```

Erwartete Ausgabe: alle Privacy-Checks ✅ und korrekte Bilanz.

## Grenzen & nächste Schritte

Für die Produktisierung auf Base-Niveau (Millionen User/Payments) siehe die priorisierte
Blocker-Liste in [`docs/PRODUCTION_READINESS.md`](docs/PRODUCTION_READINESS.md)
(Regulatorik, Audit/Setup, Batched-Insertion + Indexer, Custody, Anonymitäts-Set).

Bewusst **nicht** im PoC (externe Gates, kein Code-Problem):
- **Security-Audit** der Circuits & Contracts — Pflicht vor echtem Geld.
- **Produktiver Trusted-Setup** (Multi-Party-Ceremony) statt lokalem Single-Contributor.
- **Compliance-Layer (ASP)** — Association-Inclusion-Proofs + Viewing-Key-Disclosure (Level 3)
  sind im Design (`docs/ARCHITECTURE.md` §5), aber im PoC noch nicht im Circuit.
- **Schlüsselmodell** — Owner ist jetzt ein echter BabyJubJub-Pubkey (privKey·Base8),
  Nullifier deterministisch/nicht-malleable (Poseidon-PRF, wie Tornado Nova). Offen: volle
  Key-Hierarchie (separate Spend-/View-/Nullifier-Keys) + formales Constraint-Review.
- **Native Mobil-Prover** — der PoC nutzt WASM/snarkjs.
- **Echte OCP/DFX-Backend-Anbindung** — hier durch einen Mock-Provider ersetzt.
- **Mainnet-Deployment** — Ziel sind die großen L2 (Polygon/Base/Arbitrum), nicht Ethereum L1.

## Lizenz

MIT (PoC).
