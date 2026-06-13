# Cloister — Validation

Every layer is covered by an automated test; the protocol is then stress-tested with a
1000-transaction soak and an adversarial battery on a local chain with **real gnark proofs**.

## Unit & integration suites

| Suite | What it proves | Result |
|-------|----------------|--------|
| `prover-gnark go test ./...` | Poseidon2 native == in-circuit; note/nullifier/Merkle; circuit solves; prover roundtrip; mobile surface | ✅ pass |
| circuit constraints | `TxCircuit` size | **50,481** (incl. ASP compliance) |
| prove benchmark | steady-state prove time | **~190–220 ms** (≈ 8× vs 1.78 s circom/snarkjs) |
| `contracts hardhat test` | guards (reentrancy, fee-on-transfer, SafeERC20, dup-nullifier, pause, constructor), verifier accept/reject, **real-proof deposit E2E**, replay | ✅ 12/12 |
| `sdk test/e2e-native.mjs` | the rewired SDK (curve-free pubKey, Poseidon2, zero=0) builds a witness that satisfies the circuit and proves | ✅ pass |

## 1000-transaction soak (`soak/soak.mjs`)

Local hardhat + `proverd`, real Groth16 proofs, deterministic note model across deposits,
internal transfers and withdrawals. **After every single transaction** two hard invariants
are asserted:

- on-chain `token.balanceOf(pool)` == model pool balance
- Σ(unspent note amounts) == model pool balance

**Result:** `✓ 1000 txs OK` — **360 deposits, 402 transfers, 238 withdrawals** in 786.7 s
(~0.79 s/tx end-to-end incl. proof + chain). Final pool balance 16,423,849 across 762
unspent notes. No invariant ever violated.

## Adversarial battery (`soak/adversarial.mjs`)

Each attack is run against the real pool with a genuine proof; all must revert.

| Attack | Result |
|--------|--------|
| tampered proof element (`a[0]^1`) | ✅ reverted (invalid proof) |
| tampered public signal (`newRoot`) | ✅ reverted (invalid proof) |
| wrong `oldRoot` (stale) | ✅ reverted |
| extData tampered (recipient) → `ExtDataHash` mismatch | ✅ reverted |
| duplicate nullifier in one tx | ✅ reverted |
| replay of a landed tx (double-spend) | ✅ reverted |
| re-spend a note (nullifier reuse across txs) | ✅ reverted |

**Result:** 7/7 attacks correctly reverted; the interleaved valid deposit + spend landed.

## Environments exercised

- **Go / desktop** native prover (benchmark, prover roundtrip).
- **proverd** HTTP backend (soak, adversarial, SDK E2E).
- **iOS native module** (gomobile xcframework) — Go-level surface tested (`mobile` package);
  on-simulator smoke documented in the build notes.
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
