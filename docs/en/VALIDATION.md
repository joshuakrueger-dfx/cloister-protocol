# Cloister — Validation

Every layer is covered by an automated test; the protocol is then stress-tested with a
1000-transaction soak and an adversarial battery on a local chain with **real gnark proofs**.

## Unit & integration suites

| Suite | What it proves | Result |
|-------|----------------|--------|
| `prover-gnark go test ./...` | Poseidon2 native == in-circuit (differential + known-answer); note/nullifier/Merkle; circuit solves; prover roundtrip; mobile surface | ✅ pass |
| **circuit adversarial** (`TestTxCircuitBoundaryAndAdversarial`) | at the *circuit* level: duplicate input nullifiers, value-not-conserved (mint), zero-value output (valid edge), out-of-range amount `2²⁴⁸` (overflow) — each unsatisfiable | ✅ pass |
| **no under-constrained signals** (`TestTxCircuitNoUnderConstrainedSignals`) | every signal is constrained — closes the #1 ZK forge class (a free signal = forgeable proof) | ✅ pass |
| **tampered witness/proof rejection** (`Test*RejectsTamperedWitness`, `TestGroth16RejectsTamperedProofAndInput`) | flip one bit in witness / proof / public input → unsatisfiable or pairing fails | ✅ pass |
| **randomized completeness** (`TestTxCircuitCompletenessRandomized`) | many random *valid* witnesses all prove (no false negatives) | ✅ pass |
| **deployed verifier == committed keys** (`TestDeployedVerifierMatchesCommittedKeys`) | the on-chain Solidity verifier corresponds to the committed proving/verifying keys — no key/verifier drift | ✅ pass |
| **ceremony roundtrip** (`TestCeremonyRoundtrip`) | an MPC Phase-2 contribution + verification round-trips (trusted-setup tooling) | ✅ pass |
| circuit constraints | `TxCircuit` size | **50,481** (incl. ASP compliance) |
| prove benchmark | steady-state prove time | **~190–220 ms** (≈ 8× vs 1.78 s circom/snarkjs) |
| `contracts hardhat test` | guards (reentrancy, fee-on-transfer, SafeERC20, dup-nullifier, pause, constructor), verifier accept/reject, **real-proof deposit E2E**, replay | ✅ 12/12 |
| `sdk test/e2e-native.mjs` | the rewired SDK (curve-free pubKey, Poseidon2, zero=0) builds a witness that satisfies the circuit and proves | ✅ pass |

## 1000-transaction soak (`soak/soak.mjs`)

A full-stack stress test on a local hardhat chain with **real Groth16 proofs** (via
`proverd`), not mocks. It maintains a deterministic note model for two key-holders
(payer + payee) and drives a realistic mix of operations.

### What each operation exercises

| Op | Inputs → Outputs | `extAmount` | Exercises |
|----|------------------|-------------|-----------|
| **Deposit** | 0 real (2 dummy) → `[amount, 0]` | `+amount` | dummy-input handling, `publicAmount = +amount`, token `transferFrom` + balance-delta check, fresh-leaf insertion |
| **Transfer** | 1 note → `[send, change]` to payer/payee | `0` | real-input membership + nullifier, value conservation (internal, no tokens move), amount hiding |
| **Withdraw** | 1 note → `[change, 0]` | `−w` | field-encoded negative `publicAmount = p − w`, `transfer` to recipient, conservation `Σin = Σout + w` |

Operation selection is seeded (reproducible): deposit if the note pool is thin or with
~35% probability, otherwise ~40% transfer / ~25% withdraw. The local Merkle tree is kept
in lock-step with on-chain insertion order (outputs occupy the next two leaves).

### Invariants asserted after *every* transaction

1. `token.balanceOf(pool)` **==** model pool balance (the chain agrees with the ledger).
2. `Σ(unspent note amounts)` **==** model pool balance (no value created or destroyed).

A single mismatch aborts the run immediately, so completing 1000 txs means all 1000
held both invariants.

### Result

```
   50/1000  pool=974576    notes=35   (19.6s)
  250/1000  pool=4572628   notes=189  (117.9s)
  500/1000  pool=8084249   notes=384  (293.0s)
  750/1000  …                          (≈580s)
 1000/1000  pool=16423849  notes=762  (786.7s)   {deposit:360, transfer:402, withdraw:238}
✓ 1000 txs OK
```

- **1000/1000 transactions passed** — **360 deposits, 402 transfers, 238 withdrawals**.
- ~0.79 s/tx end-to-end (witness build + on-device-class proof + on-chain verify + mine).
- Final pool balance **16,423,849** across **762 unspent notes**; both invariants held on
  all 1000 transactions.
- Every proof was produced by the real gnark prover and verified by the deployed Solidity
  verifier inside `ShieldedPool.transact` — there is no mock anywhere in this path.

## Adversarial battery (`soak/adversarial.mjs`)

Each attack is mounted against the **real deployed pool** using a **genuine valid proof**
as the starting point, then corrupting exactly one thing. Every attack must revert; a
single success aborts the run. Two valid transactions are interleaved to prove the pool
still accepts honest traffic between attacks.

| # | Attack | What it targets | Control that catches it | Result |
|---|--------|-----------------|-------------------------|--------|
| 1 | flip a bit in proof `a[0]` | proof integrity | Groth16 pairing check (verifier) | ✅ revert |
| 2 | submit a different `newRoot` than the proof commits to | public-input binding | verifier re-derives `pub[]`; mismatch fails the pairing | ✅ revert |
| 3 | submit with a wrong `oldRoot` | root freshness / fork | `require(oldRoot == laneRoot[lane])` | ✅ revert (`stale or unknown root`) |
| 4 | change `extData.recipient` after proving | fund redirection by a relayer | `ExtDataHash` is a bound public input; contract recomputes `keccak(extData)` → mismatch | ✅ revert |
| 5 | pass `[nf0, nf0]` (same nullifier twice) | in-tx double-spend | `require(nf0 != nf1)` (and the circuit asserts it) | ✅ revert (`duplicate nullifier`) |
| 6 | replay an already-landed tx verbatim | double-spend via replay | `nullifierSpent` set + stale root | ✅ revert |
| 7 | spend an already-spent note again (reuse its nullifier) | cross-tx double-spend | global `nullifierSpent` set | ✅ revert |

Interleaved honest traffic: a valid deposit landed (after attacks 1–5), and a valid spend
of that deposited note landed (before attacks 6–7) — confirming the pool is not merely
rejecting everything.

**Result:** **7/7 attacks reverted**; both interleaved valid transactions succeeded.

> Note: the harness uses `NonceManager.reset()` after each expected-revert, because a tx
> that fails gas-estimation never consumes an on-chain nonce.

## Environments exercised

- **Go / desktop** native prover (benchmark, prover roundtrip).
- **proverd** HTTP backend (soak, adversarial, SDK E2E).
- **iOS native module** (gomobile xcframework) — Go-level surface tested (`mobile`
  package); the Swift↔Go bridge **compiles + links** against the xcframework, and
  `MobileHash([1,2])` **executed on the booted iPhone-Air simulator** returned a value
  byte-identical to the Go/`proverd` Poseidon2 (`4443…2364`) — cross-platform consistency
  proven on the iOS runtime.
- **On real iPhone Air hardware (iOS 26.5.1):** the native gnark prover produced a full
  Groth16 proof (50,481 constraints) in **~366–438 ms** (verify ~1 ms); the 9.3 MB proving
  key loaded and proved with no memory issue — **comfortably under the 1 s goal** (desktop
  was ~200 ms; the ~2× is expected on mobile ARM).
- The same witness verifies identically across the native verify path and the on-chain
  Solidity verifier (the contract E2E + the soak's per-tx verification).

## Reproduce

```bash
# infra
cd packages/contracts && npx hardhat node &
cd packages/prover-gnark && go run ./cmd/proverd ./keys :8792 &

# suites
(cd packages/prover-gnark && go test ./...)
(cd packages/contracts && npx hardhat test)
(cd packages/sdk && node test/e2e-native.mjs http://127.0.0.1:8792)

# stress
(cd packages/contracts && node soak/soak.mjs 1000)
(cd packages/contracts && node soak/adversarial.mjs)
```

## Caveats

- Soak/adversarial run on a local hardhat chain (per the chosen scope). A Base Sepolia
  run + a physical-device E2E are the remaining steps (need the deployer key + the phone).
- Trusted setup is a single `groth16.Setup` run; mainnet needs a Phase-2 ceremony.
- An independent external audit is required before handling real value.
