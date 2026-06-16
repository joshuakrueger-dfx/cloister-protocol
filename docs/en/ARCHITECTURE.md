# Cloister — Architecture

Cloister is a compliant, encrypted-UTXO **shielded pool** for EVM chains: a privacy layer
that lets a payer settle a payment without revealing the on-chain link between their funds
and the recipient, while still proving — in zero knowledge — that the funds belong to a
compliance "good set" (the Association-Set-Provider, ASP). It is a standalone DFX product;
OpenCryptoPay is its first integration, but the protocol is payment-rail agnostic.

> This `docs/en/` set documents the **as-built gnark system**. The German `docs/*.md`
> are the design-phase documents and may reference the superseded circom design.

## System at a glance

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

## Components

### `packages/prover-gnark` (Go; Apache-2 deps; MIT code)
The entire zero-knowledge layer, self-built on **gnark / gnark-crypto**:
- `zk/` — Poseidon2 hash (native == in-circuit, proven by `hash_test`), the curve-free
  note scheme (`pubKey = H(privKey)`), the fixed-depth (2²⁰) Merkle tree, and the
  `TxCircuit` (2-in/2-out: pool membership, ASP compliance, value conservation, nullifier
  uniqueness, off-chain insertion).
- `prover/` — reusable proving library (`Load(keys)` once → `Prove`).
- `mobile/` — gomobile binding (`Cloister.xcframework`) for on-device proving.
- `cmd/setup` — Groth16 setup → keys + exported MIT Solidity verifier.
- `cmd/proverd` — HTTP prover for dev/CI/Node (NOT a production path; see PRIVACY).

### `packages/contracts` (Solidity; MIT / OpenZeppelin)
- `ShieldedPool.sol` — the pool. Holds `numLanes` independent Merkle roots (parallelism),
  a global nullifier set (cross-lane double-spend prevention), and the ASP compliance gate.
  The root transition `oldRoot → newRoot` is proven in-circuit, so the contract performs
  **no on-chain Poseidon** (≈5× gas saving — "off-chain insertion").
- `Groth16Verifier.sol` — gnark-exported verifier (MIT).
- `TransactionVerifier.sol` — `(a,b,c)`-struct adapter over the gnark verifier.
- `PoolRegistry.sol` — `chainId+asset → pool`, 2-step-owned, append-only, visible migrate.

### `packages/sdk` (JS; MIT-compatible deps)
Keys, notes, Merkle tree, note encryption (nacl box + view tags), `buildWitness`, the
pluggable crypto **backend** (native module on device, `proverd` in dev), the resilient
**submit** layer, and indexer/chain **sync** with fallback.

### `packages/api` (relayer) and `packages/indexer`
The relayer's `/v1/shielded/submit` is **broadcast-only**: it accepts a finished proof +
calldata, pays gas and submits, hiding the user's address. It never sees the witness. The
indexer turns `NewCommitment` events into a tree and offers view-tag filtered discovery.

### `dfx-wallet/modules/cloister-prover` (native module)
A local Expo module wrapping `Cloister.xcframework`; exposes `initProver / hash / prove`
to JS. The proving keys ship in the app bundle; the witness never leaves the device.

## Key design decisions

| Decision | Why |
|----------|-----|
| **gnark (not circom/snarkjs)** | Apache-2 (no GPL); native prover ~8× faster than WebView snarkjs |
| **Poseidon2** | one hash for native + in-circuit; smaller circuit (50,481 constraints) |
| **curve-free pubKey `H(priv)`** | structurally eliminates the BabyJubJub scalar self-double-spend class |
| **off-chain Merkle insertion** | proof carries `oldRoot→newRoot`; contract does no Poseidon → ~5× gas |
| **lanes** | independent roots → parallel txs in one block; global nullifier set keeps safety |
| **ASP compliance root** | 10th public signal; every real input proven ∈ good set |
| **on-device proving** | privacy (witness never leaves device) + works offline |
| **broadcast-only relayer** | liveness + sender privacy without the relayer learning secrets |

## Transaction lifecycle

1. Wallet builds the witness from local notes + tree paths (Poseidon2 via the native module).
2. The native prover produces a Groth16 proof + 10 public signals on-device (sub-second).
3. `submitShielded` sends proof + calldata to a relayer (idempotent, with fallback).
4. `ShieldedPool.transact` re-derives the public signals, calls the verifier, and on
   success spends the nullifiers, emits the new commitments, and advances the lane root.
5. The indexer observes `NewCommitment`; recipient wallets discover their note via view tags.

See `SECURITY.md`, `PRIVACY.md`, `CIRCUIT.md`, `FALLBACKS.md`, `INTEGRATION.md`, `VALIDATION.md`.
