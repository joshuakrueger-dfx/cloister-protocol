# Groth16 Phase-2 MPC ceremony (fills the trusted-setup gap)

**Status (2026-06-16): tooling BUILT, ceremony NOT YET EXECUTED.** `cmd/ceremony` +
`packages/prover-gnark/ceremony` implement the full multi-party flow and are proven end-to-end by
`ceremony/ceremony_test.go` (a CI job runs a real 2+2-contribution ceremony and confirms the
extracted keys prove+verify the circuit). What remains is the *operational* run with real,
independent contributors + a public beacon — then redeploy the resulting verifier. The testnet
pilot still uses the single-party `cmd/setup` keys until then.

**Why:** today `pk/vk` come from a single `groth16.Setup` run. Whoever held the randomness
("toxic waste") could forge proofs → mint value → drain the pool. This is a launch-blocking
gap (STRESS_TEST §0.3). Groth16 needs a **per-circuit Phase-2** on top of a universal
Phase-1 (Powers of Tau). Security holds if **≥1 honest participant** deletes their secret.

## Plan

1. **Phase-1 (universal):** reuse a large, well-known existing Powers-of-Tau (e.g. the
   community `pot` files) sized ≥ 2^17 (our circuit is 50,481 constraints). Do **not** run
   our own Phase-1.
2. **Phase-2 (circuit-specific):** contributions over our `circuit.r1cs`. gnark supports
   MPC setup (`backend/groth16/.../mpcsetup`): `Phase2` init from Phase-1 + R1CS, then N
   sequential contributions, each adding entropy and producing a transcript.
3. **Contributors:** ≥5 independent parties (DFX team, external auditors, community,
   ideally a hardware-isolated machine). Each: download state → contribute (fresh entropy,
   ideally airgapped) → publish transcript hash → **destroy local secret**.
4. **Beacon:** finalize with a public randomness beacon (e.g. a future drand round / a BTC
   block hash fixed in advance) so the last step is non-grindable.
5. **Verify:** anyone re-checks the full transcript chain (gnark `mpcsetup.Verify`); derive
   `pk/vk`; **re-export the Solidity verifier** from the ceremony `vk` and redeploy.
6. **Publish:** transcripts, contributor attestations, verifier address, and a one-command
   verifier so third parties reproduce the check.

## Deliverables when executed

- `cmd/ceremony` tooling (init/contribute/verify/finalize) wrapping gnark mpcsetup. **✅ BUILT.**
- Public ceremony transcript + attestations. *(produced when the run happens)*
- New `Groth16Verifier.sol` from the ceremony `vk`; pool redeploy. *(when the run happens)*

## Running it (tooling is built)

```bash
cd packages/prover-gnark
# coordinator seeds the universal Phase-1 base
go run ./cmd/ceremony phase1-init                 transcript/p1-0.bin
# each contributor i, on a clean offline machine: read prev → contribute → DISCARD machine
go run ./cmd/ceremony phase1-contribute  transcript/p1-0.bin transcript/p1-1.bin
go run ./cmd/ceremony phase1-contribute  transcript/p1-1.bin transcript/p1-2.bin
# coordinator: verify the chain + seal with a PUBLIC beacon (e.g. a pre-announced BTC block hash)
go run ./cmd/ceremony phase1-verify  "$BEACON" transcript/commons.bin transcript/p1-1.bin transcript/p1-2.bin
# circuit-specific Phase-2, same contribute pattern
go run ./cmd/ceremony phase2-init        transcript/commons.bin transcript/p2-0.bin
go run ./cmd/ceremony phase2-contribute  transcript/p2-0.bin transcript/p2-1.bin
go run ./cmd/ceremony phase2-contribute  transcript/p2-1.bin transcript/p2-2.bin
go run ./cmd/ceremony phase2-finalize "$BEACON" transcript/commons.bin ../../keys-ceremony transcript/p2-1.bin transcript/p2-2.bin
# → keys-ceremony/{pk.bin,vk.bin,circuit.r1cs,Groth16Verifier.sol}
```

**Independent re-verification:** anyone re-runs `phase1-verify` + `phase2-finalize` over the
published transcript and checks the resulting `Groth16Verifier.sol` byte-matches the deployed
verifier (the provenance gate, `prover-gnark/provenance`, already enforces verifier == committed
`vk.bin`). Security holds if ≥1 contributor in each phase discarded their secret.

## Gate

No mainnet value before the ceremony `vk` is the deployed verifier. Until then: testnet /
gated pilot only, clearly labeled "pre-ceremony, no real funds."
