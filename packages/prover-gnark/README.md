# Cloister Prover (gnark)

Self-built zero-knowledge layer for the Cloister shielded pool, written from scratch
on the **gnark** stack (Go, Apache-2.0). No GPL-licensed code (no circom / snarkjs /
rapidsnark), no copied third-party circuits — clean, proprietary IP owned by DFX AG.

## Why this exists

The original prototype used circom + snarkjs (GPL-3.0) and proved in the browser /
WebView at **~1.78 s**. That is (a) an IP/licensing conflict and (b) far too slow for
a point-of-sale payment. This package rebuilds the entire proving layer:

- **gnark / gnark-crypto** (Apache-2.0) — no copyleft, commercially clean.
- **Native Go prover** that can be bound to mobile (gomobile) for on-device proving.
- A redesigned circuit that is *smaller* than the old one **and** adds compliance.

## What's in here

| Path | Contents |
|------|----------|
| `zk/hash.go` | Native Poseidon2 `H(...)` — proven byte-identical to the in-circuit hasher (`zk/hash_test.go`, the foundational correctness gate). |
| `zk/note.go` | Note scheme: `PubKey = H(priv)` (curve-free → structurally eliminates the scalar self-double-spend class), commitment, signature, nullifier. |
| `zk/merkle.go` | Fixed-depth (2²⁰ ≈ 1.05M notes) Poseidon2 Merkle tree + membership/insertion paths. |
| `zk/circuit.go` | `TxCircuit` — 2-in/2-out shielded transaction with pool membership, **association-set (ASP) compliance**, value conservation, nullifier uniqueness, and off-chain insertion (Root → NewRoot). |
| `zk/witness.go` | `BuildAssignment(*TxSpec)` — native witness builder. |
| `prover/prover.go` | Reusable proving library: load keys once, `Prove(spec) → {proofBytes, a, b, c, public[10]}`. |
| `cmd/setup` | Groth16 setup → persists `keys/{pk,vk}.bin` + `circuit.r1cs`, exports the matching Solidity verifier. |
| `cmd/emitproof` | Emits a real proof as JSON for the on-chain verifier test. |
| `build/Verifier.sol` | gnark-exported Groth16 verifier (MIT). Installed into `packages/contracts` as `Groth16Verifier.sol` + an `(a,b,c)` adapter. |

## Results (measured)

| Metric | Old (circom/snarkjs) | New (gnark) | Δ |
|--------|----------------------|-------------|---|
| Circuit constraints | 56,734 (no compliance) | **50,481** (with ASP compliance) | −11% *and* +compliance |
| Prove time | ~1,780 ms (WebView) | **~190–220 ms** (desktop Go, steady state) | **~8× faster** |
| Verify | — | ~0.7 ms native / on-chain pairing | — |
| Licensing | GPL-3.0 chain | Apache-2 / MIT only | IP-clean |

On-chain: `packages/contracts/test/TransactionVerifier.test.js` proves a real gnark
proof verifies through both the native bytes interface and the `(a,b,c)` adapter, and
that tampered proofs / public signals are rejected. All 10 contract tests pass.

## Reproduce

```bash
go test ./...                       # primitives, circuit, prover (all green)
go run ./cmd/setup .                # one-time: keys/ + build/Verifier.sol
go run ./cmd/emitproof ./keys ../contracts/test/testdata/proof.json
go test ./prover -bench BenchmarkProve -benchtime 10x   # A2 measurement
```

## Public-signal order (must match the on-chain verifier)

`[Root, PublicAmount, ExtDataHash, InputNullifier0, InputNullifier1,
OutputCommitment0, OutputCommitment1, NewRoot, PairIndex, AssociationRoot]`

## Trust setup

`groth16.Setup` uses fresh internal randomness ("toxic waste"). The persisted keys are
the testnet source of truth. **For mainnet this must be replaced by a multi-party
Phase-2 ceremony** — see the milestone plan.

## Speed plan status

- **A1** circuit slimming — done (Poseidon2 + tight range checks → 50.5k constraints).
- **A2** native prover — done (this package, ~8× over WebView). On-device (gomobile)
  binding is the next integration step.
- **A3** witness precompute + background sync — designed (SDK/wallet integration).
- **A4** optimistic "Paid" UX — designed (wallet integration).
