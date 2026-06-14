# Concept — Groth16 Phase-2 MPC ceremony (fills the trusted-setup gap)

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

- `cmd/ceremony` tooling (init/contribute/verify) wrapping gnark mpcsetup.
- Public ceremony transcript + attestations.
- New `Groth16Verifier.sol` from the ceremony `vk`; pool redeploy.

## Gate

No mainnet value before the ceremony `vk` is the deployed verifier. Until then: testnet /
gated pilot only, clearly labeled "pre-ceremony, no real funds."
