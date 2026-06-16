# Cloister — External Audit Readiness Package

A pre-audit intake document for an independent security firm (e.g. Trail of Bits, OpenZeppelin,
Zellic, Veridise). It defines scope, the trust + threat model, the security properties claimed,
and the in-repo evidence that already substantiates them — so the engagement is shorter, cheaper,
and starts from a known baseline instead of cold. It is deliberately explicit about what is **not**
done (the honesty an auditor needs to scope correctly).

> Status: Base Sepolia testnet pilot, pre-ceremony. No real value is at risk yet. This package
> targets the audit that gates mainnet.

---

## 1. Scope

**In scope (the value-bearing core):**

| Component | Path | Language |
|---|---|---|
| Transaction circuit (soundness-critical) | `packages/prover-gnark/zk/` (`circuit.go`, `note.go`, `merkle.go`, `hash.go`) | Go / gnark |
| Proving library + gomobile bind | `packages/prover-gnark/prover/`, `packages/prover-gnark/mobile/` | Go |
| On-chain pool + verifier | `packages/contracts/contracts/` (`ShieldedPool.sol`, `TransactionVerifier.sol`, `Groth16Verifier.sol`, `PoolRegistry.sol`) | Solidity 0.8.20 |
| Trusted-setup / ceremony tooling | `packages/prover-gnark/cmd/setup`, `packages/prover-gnark/ceremony/`, `cmd/ceremony` | Go / gnark |
| Witness/extData construction (cross-language binding) | `packages/sdk/src/witness.js`, `packages/prover-gnark/zk/witness.go` | JS / Go |

**Out of scope for the protocol audit (separately reviewed / non-value-bearing):**
the relayer (`packages/api`, key-less, read-only), the indexer (`packages/indexer`), the wallet
app integration (`dfx-wallet`), and the legacy demo scripts (`apps/demo`, pre-gnark). The relayer
and indexer are availability/privacy-relevant but cannot move or forge funds (see §3).

**Commit / artifact pinning:** `keys/SETUP_MANIFEST.md` pins the SHA-256 of `vk.bin` +
`Groth16Verifier.sol` and the deployed verifier address; the `provenance` Go test fails CI if they
drift. Audit against a tagged commit + that manifest.

---

## 2. System & trust model

Encrypted-UTXO shielded pool on an EVM chain. Notes are Poseidon2 commitments in a fixed-depth-20
Merkle tree; spends prove membership + reveal a nullifier; outputs are inserted off-chain and the
root transition is proven in-circuit (the contract computes **zero** Poseidon hashes). Compliance:
every real input proves membership in an ASP "good-set" association root.

**Trusted parties (and the blast radius if they misbehave):**
- **Trusted setup / ceremony:** until the MPC ceremony runs, the single-party `cmd/setup` holder
  could forge proofs → mint/steal. This is the #1 gate (see §6). Post-ceremony: secure if ≥1
  contributor was honest.
- **ASP (association-set provider):** defines the compliance good-set. A malicious ASP can include
  illicit notes or (now) revoke roots; it cannot mint or steal. Roots are append-only + revocable
  (`revokeAspRoot`); monotonicity is a trusted off-chain property, not an on-chain invariant.
- **Guardian:** can pause (time-boxed, non-renewable cooldown → never a permanent freeze) and set a
  withdrawal cap; cannot mint, steal, or seize. Two-step role transfer.
- **Relayer / indexer:** untrusted for safety (the chain is authoritative); trusted for
  availability + (indexer) query privacy.

---

## 3. Security properties claimed (the audit targets)

1. **No forgery / unforgeable proofs** — only valid witnesses satisfy the circuit; every public
   signal is bound to the private witness (no under-constrained signal). *Exception by design:*
   `ExtDataHash` is bound on-chain, not in-circuit.
2. **No value creation** — `Σ in + publicAmount = Σ out`; amounts range-checked to 248 bits;
   field-wraparound is unreachable (contract clamps `|extAmount|, fee < 2^248 ≪ p`).
3. **No double-spend** — one note ↔ one nullifier (curve-free key, no `s`/`s+order` malleability);
   global on-chain nullifier set; in-tx duplicate check.
4. **Recipient/amount non-malleability** — `extDataHash = keccak(abi.encode(extData)) % p`
   recomputed on-chain and bound into the proof; a relayer cannot redirect funds.
5. **Fail-closed on-chain authority** — `require(oldRoot == laneRoot)`, on-chain-recomputed
   `pairIndex`/`extDataHash`, then `verifyProof`. No off-chain data (bad RPC logs, malicious
   relayer, wrong leaves) can cause loss — worst case is a reverted tx.
6. **Contract safety** — strict CEI, ReentrancyGuard, SafeERC20, fee-on-transfer rejection,
   non-permanent emergency stop, withdrawal cap.
7. **Compliance binding** — every real input proves membership in the ASP good-set root.

---

## 4. Evidence already in the repo (what to leverage, not redo)

| Property | Evidence | Where |
|---|---|---|
| No under-constrained signal | mutates EVERY witness signal (26) in isolation; each must be rejected | `zk/property_test.go::TestTxCircuitNoUnderConstrainedSignals` |
| Completeness | 256 randomized valid txs all satisfy the circuit | `zk/property_test.go::TestTxCircuitCompletenessRandomized` |
| Real prove→verify + tamper-fails | valid proof verifies; tampered public input / corrupted proof do not | `zk/groth16_negative_test.go`, `zk/groth16_test.go` |
| Boundary/adversarial | dup nullifier, non-conservation, zero output, out-of-range 2^248 | `zk/property_test.go::TestTxCircuitBoundaryAndAdversarial` |
| Real-verifier on-chain negatives | tampered nullifier/commitment/newRoot/assocRoot revert via the actual verifier | `contracts/test/ShieldedPool.transact.e2e.test.js` |
| extData binding airtight | tampered extData reverts (`invalid proof`) on the real verifier | same e2e file |
| Cross-language extData (JS=Go=Solidity) | KAT against the gnark/Solidity-verified golden | `packages/sdk/test/extdata.kat.test.mjs` |
| Poseidon2 KAT | known-answer vector guards hash drift | `zk/soundness_test.go::TestPoseidon2KnownAnswer` |
| Contract guards | reentrancy/CEI, SafeERC20, fee-on-transfer, pause cooldown, ASP revocation, 2-step transfers, withdrawal cap | `contracts/test/ShieldedPool.guards.test.js` |
| Verifier ↔ key provenance | CI fails if `Groth16Verifier.sol` drifts from `vk.bin` | `prover-gnark/provenance/provenance_test.go` |
| Constants consistency | FIELD_SIZE / MERKLE_LEVELS identical across Solidity/Go/JS | `scripts/check-constants.mjs` |
| Ceremony correctness | full 2+2-contribution roundtrip; extracted keys prove+verify | `ceremony/ceremony_test.go` |
| Static analysis | Slither, hard-fails on High | CI `slither` job |
| Enforcement | CI on every push/PR; pre-push hook; race detector | `.github/workflows/ci.yml`, `.githooks/pre-push` |

A prior internal multi-agent line-by-line audit is in `docs/en/PRODUCTION_AUDIT.md` (with a dated
§0 status of what has since been resolved).

---

## 5. Build & reproduce

```bash
# circuit + prover (incl. soundness suite, real prove/verify, provenance gate)
cd packages/prover-gnark && go test -race ./...
go test ./ceremony/                      # MPC ceremony roundtrip (~3min)
# contracts (incl. real-proof E2E + verifier negatives)
cd ../contracts && pnpm install && pnpm test
# cross-language + constants
cd ../.. && pnpm --filter @cloister/sdk test && node scripts/check-constants.mjs
# verify the deployed verifier == committed key
cd packages/prover-gnark && go test ./provenance/
```

---

## 6. Known-deferred (honest — please scope around these)

- **MPC ceremony NOT YET RUN.** Tooling is built + CI-proven (`cmd/ceremony`, §4), but the
  operational multi-party run + verifier redeploy is pending. The single-party `cmd/setup` keys
  back the testnet pilot. **This is the #1 mainnet blocker.**
- **Circuit hardening bundled for the ceremony re-key cycle** (each needs new keys, so deferred to
  the same cycle): bind `extDataHash` in-circuit (currently on-chain only); in-circuit range check
  on `publicAmount` (currently contract-clamped); domain/chain/version separation; root-history
  window (membership-root decoupling).
- **Compliance model is a trust + legal question**, not just code: ASP governance/decentralization,
  Level-3 viewing-key selective disclosure (designed, not enforced), OFAC/sanctions screening, and
  the regulatory viability of a compliant pool (CH/EU/US) are open and out of code scope.
- **Anonymity set** — privacy is emergent in the user base; the small-set privacy degradation is a
  product risk, not a circuit property.
- **Operational:** the relayer is a single, manually-supervised process; two `deployment.*.json`
  descriptors should be reconciled to one canonical pilot pool.

---

## 7. Findings format (please use)

For each finding: **ID · Severity (Critical/High/Medium/Low/Info) · Component · File:line ·
Description · Concrete reproduction · Recommended fix · (optional) PoC**. We track remediation in
the same table with a status column and re-verify against a regression test before closing.
