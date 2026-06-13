# Cloister — Circuit specification

`TxCircuit` (gnark, Groth16 over BN254). A 2-input / 2-output shielded transaction.
Source of truth: `packages/prover-gnark/zk/circuit.go`. **50,481 R1CS constraints.**

## Primitives

- **Hash** `H`: Poseidon2 in Merkle–Damgård mode (`gnark-crypto .../poseidon2`). The native
  hash (`zk/hash.go`) is proven bit-identical to the in-circuit hasher by `hash_test.go`.
- **Key**: `pubKey = H(privKey)` — curve-free. No BabyJubJub, no subgroup-order constraint.
- **Note commitment**: `C = H(amount, pubKey, blinding)`.
- **Signature**: `sig = H(privKey, C, leafIndex)`.
- **Nullifier**: `nf = H(C, leafIndex, sig)` — deterministic per (note, position), unlinkable
  to `C` without `privKey`.
- **Merkle**: fixed depth `Levels = 20` (2²⁰ ≈ 1.05M notes). Empty leaf = `0`. Node `= H(l, r)`.

## Public signals (this exact order; matches the on-chain verifier + `pub[10]`)

| # | Name | Meaning |
|---|------|---------|
| 0 | `Root` | pool Merkle root the inputs are proven against |
| 1 | `PublicAmount` | `extAmount − fee`, field-encoded (deposit `+`, withdraw `p − |x|`) |
| 2 | `ExtDataHash` | `keccak(extData) mod p` — binds recipient / relayer / fee / encrypted outputs |
| 3 | `InputNullifier[0]` | |
| 4 | `InputNullifier[1]` | |
| 5 | `OutputCommitment[0]` | |
| 6 | `OutputCommitment[1]` | |
| 7 | `NewRoot` | root after inserting the two outputs as one pair node |
| 8 | `PairIndex` | insertion slot (`= laneNextIndex / 2`) |
| 9 | `AssociationRoot` | compliance: inputs proven ∈ the ASP good-set |

## Constraints enforced

For each input `t ∈ {0,1}`:
1. `pub = H(privKey_t)`, `C = H(amount_t, pub, blinding_t)`, `sig = H(privKey_t, C, idx_t)`,
   `nf = H(C, idx_t, sig)`; **assert** `nf == InputNullifier[t]`.
2. **Range**: `amount_t ∈ [0, 2²⁴⁸)` (via `ToBinary`, prevents field-wrap value forgery).
3. `isReal = 1 − IsZero(amount_t)`. Dummy (zero-value) inputs skip membership.
4. **Pool membership** (real only): `climb(C, idx_t, pathEls_t) == Root`, enforced by
   `(root − Root)·isReal == 0`.
5. **ASP membership** (real only): `climb(C, assocIdx_t, assocEls_t) == AssociationRoot`.

For each output `t`:
6. `C = H(amount_t, pubKey_t, blinding_t)`; **assert** `C == OutputCommitment[t]`.
7. **Range**: `amount_t ∈ [0, 2²⁴⁸)`.

Global:
8. `AssertIsDifferent(InputNullifier[0], InputNullifier[1])` — no in-tx double-spend.
9. **Value conservation**: `Σ inAmount + PublicAmount == Σ outAmount` (in the field).
10. `ExtDataHash` is bound as a public input (tamper-evident).
11. **Off-chain insertion**: with `z1 = H(0,0)` and `pairNode = H(out0, out1)`,
    `climb(z1, PairIndex, pairPathEls) == Root` (the slot was empty) **and**
    `climb(pairNode, PairIndex, pairPathEls) == NewRoot` (correct insertion, same siblings).

## Soundness notes

- **Conservation cannot be forged by field-wrap**: every amount is range-checked to 248
  bits and there are only four of them, so `Σ` stays far below `p`. `PublicAmount` is fixed
  by the contract (not a free witness) and bounded by `MAX_EXT_AMOUNT = 2²⁴⁸`. For a
  withdrawal `PublicAmount = p − (W+F)`; the single modular wrap yields the unique integer
  relation `Σin = Σout + W + F`.
- **Empty-slot soundness**: faking an occupied slot as empty would require a Poseidon2
  second-preimage (`climb(z1, …) == Root` with fake siblings) — infeasible.
- **Nullifier binds position**: a note at a fixed leaf has exactly one nullifier; combined
  with the on-chain spent-set this prevents replay/double-spend.
- **extData binding**: Groth16 binds all declared public inputs, so altering any extData
  field changes `ExtDataHash` and invalidates the proof — a relayer cannot redirect funds.

## Trusted setup

`groth16.Setup` (own run) produces `pk/vk`; the verifier is exported from `vk`. The same
setup feeds the prover and the on-chain verifier (a mismatch yields `ProofInvalid`).
**Mainnet requires a multi-party Phase-2 ceremony** to replace the single-run keys.
