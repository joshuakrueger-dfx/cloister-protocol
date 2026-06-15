# Smart contracts

Cloister's on-chain footprint is deliberately small and auditable. This page lists the contracts,
what each one does, and where the source lives.

> **Source of truth:** `packages/contracts` in the
> [Cloister Protocol repository](https://github.com/joshuakrueger-dfx/cloister-protocol). The
> contracts are MIT-licensed and build on OpenZeppelin. Deployed addresses are published per
> network as deployments roll out.

## Contracts

### `ShieldedPool.sol`
The pool itself. It holds:

- **`numLanes` independent Merkle roots** — one per lane, enabling parallel transactions in a
  single block (see [The shielded pool → Lanes](concept-pool.html#lanes-parallelism)).
- a **global nullifier set** — cross-lane double-spend prevention.
- the **Association (compliance) root** — the gate that every real input must prove membership in.

Its `transact` function re-derives the public signals, calls the verifier, then spends the input
nullifiers, emits the output commitments, and advances the lane root. The root transition
`oldRoot → newRoot` is **proven in-circuit**, so the contract performs **no on-chain Poseidon
hashing** — the source of the ~5× gas saving.

### `Groth16Verifier.sol`
The verifier exported from the gnark trusted setup (MIT). It checks a Groth16 proof against the
verifying key. A mismatch between the proving and verifying keys yields `ProofInvalid`.

### `TransactionVerifier.sol`
A thin `(a, b, c)`-struct adapter over the gnark verifier, presenting the proof in the shape
`ShieldedPool` expects.

### `PoolRegistry.sol`
A registry mapping `chainId + asset → pool`. It is **2-step-owned**, **append-only**, and performs
**visible migrations** — so integrators can resolve the canonical pool for an asset on a chain
without trusting an opaque, mutable pointer.

## Public signals (the contract ↔ circuit interface)

`ShieldedPool` and the circuit agree on exactly **10 public signals** in a fixed order: `Root`,
`PublicAmount`, `ExtDataHash`, two `InputNullifier`s, two `OutputCommitment`s, `NewRoot`,
`PairIndex`, and `AssociationRoot`. The full table with meanings is in the
[Circuit specification](circuit.html#public-signals-this-exact-order-matches-the-on-chain-verifier-pub-10).

## Design properties

| Property | How it is achieved |
|---|---|
| No on-chain hashing | Merkle transition proven in-circuit (off-chain insertion) |
| No double-spend | global nullifier set, shared across lanes |
| Compliance enforced on-chain | `AssociationRoot` membership required for every real input |
| Tamper-evident routing | recipient/relayer/fee bound via `ExtDataHash` |
| Safe upgrades | `PoolRegistry` is append-only with visible migration |

## Audit status

The contracts and circuit were hardened in an internal adversarial audit. **External audits and a
multi-party Phase-2 trusted-setup ceremony are required before mainnet** — the current keys come
from a single setup run. See the [Disclaimer](disclaimer.html) and
[Security](security.html).
