# Cloister — Master plan (checkpointed)

Execution backbone derived from `STRESS_TEST.md`. Each checkpoint is self-contained: do
it, mark it, and we can resume from the next one if tokens/time run out. **Sequencing rule
from the panel: validation (legal + demand) gates further engineering spend.**

Status key: ☐ todo · ◐ in progress · ☑ done.

---

## Track 0 — Gaps the panel found → concept to fill each

| Gap (from stress test) | Type | Concept to fill it | Checkpoint |
|------------------------|------|--------------------|------------|
| No legal classification / opinion | Legal | Counsel question-set + jurisdiction matrix (artifact) | CP2 |
| No validated paying customer | Demand | Customer-discovery script + fake-door + interview list | CP2 |
| Single trusted setup (toxic-waste risk) | Code/crypto | MPC Phase-2 ceremony design + tooling plan | CP3 |
| Anonymity-set cold start | Protocol | Min-viable-set model + linkability simulation + seeding/batching concept | CP3 |
| Relayer centralization | Protocol | Relayer-set design + incentive + multi-relayer test | CP3 |
| ASP centralization/liability | Protocol/legal | ASP decentralization + attestation-format concept | CP3 |
| CEX/off-ramp acceptance of pool funds | Ops | Acceptance-test protocol + ASP-attestation handshake | CP2 |
| No external audit | Code/security | Audit-readiness pack + Big-Brother pre-audit pass | CP4–CP5 |
| Pool capacity ceiling (2²⁰) | Protocol | Pool-rotation / multi-pool concept | CP3 |
| Product-vs-feature ambiguity | Strategy | Standalone B2B wedge definition | CP2 |

---

## Checkpoints

### CP1 — Stress test + this plan ☑
Output: `STRESS_TEST.md` (15 phases, verdict: validate-first / consider pivot), this plan,
task list. **Done.**

### CP2 — Validation artifacts (the panel's #1 priority, cheap) ☐
Produce the non-code artifacts that buy the fastest truth (no engineering):
1. `docs/en/validation/LEGAL_QUESTIONS.md` — the exact questions for crypto-regulatory
   counsel + a jurisdiction matrix (CH/EU/US).
2. `docs/en/validation/CUSTOMER_DISCOVERY.md` — interview script for Persona A (treasury)
   & C (PSP), 20-name target list template, fake-door pricing-page copy.
3. `docs/en/validation/OFFRAMP_ACCEPTANCE.md` — protocol to test whether a CH/EU CEX
   accepts pool-withdrawn USDC + the ASP-attestation handshake.
4. `docs/en/validation/WEDGE.md` — standalone B2B wedge vs. OCP-feature decision memo.
**Checkpoint:** artifacts exist + reviewed. (These are for the human to execute; I produce
the instruments.)

### CP3 — Code-addressable concept designs (no premature build) ☐
Write concept docs (design, not implementation) so they're ready when validation clears:
1. `docs/en/concepts/MPC_CEREMONY.md` — Phase-2 ceremony (gnark/snarkjs-mpc tooling,
   coordinator, contributor flow, verification, re-export verifier).
2. `docs/en/concepts/ANONYMITY_SET.md` — min-viable-set math, linkability-vs-volume
   simulation design, seeding + batching + decoy strategy, deposit/withdraw timing.
3. `docs/en/concepts/RELAYER_NETWORK.md` — relayer set, fee/incentive, censorship
   resistance, sender-privacy guarantees, submission already abstracted in `submit.js`.
4. `docs/en/concepts/ASP_DECENTRALIZATION.md` — attestation format, multi-ASP, monotone
   good-set, CEX-consumable proof.
5. `docs/en/concepts/POOL_ROTATION.md` — 2²⁰ ceiling → pool rotation / multi-pool routing.
**Checkpoint:** concept docs exist; the *one* with code value (anonymity-set simulation)
gets a runnable script in CP3b.

### CP3b — Test the one concept that is code today: anonymity-set linkability sim ☐
Implement `packages/prover-gnark/sim/` or a Node sim: model deposits/withdrawals, measure
linkability (entropy / set-size) vs. volume, output the minimum volume for "real" privacy.
**Checkpoint:** sim runs, produces a min-volume number, written into `ANONYMITY_SET.md`.

### CP4 — Big Brother: update + run over the whole codebase ☐
Per the documented procedure (BB on the Studio, provider=claude): update BB, point it at
the cloister-protocol repo (+ the dfx-wallet cloister module), run the orchestrator/tester
so it independently finds problems. Capture its findings report.
**Checkpoint:** BB run completed; findings list captured to `docs/en/BB_FINDINGS.md`.

### CP5 — Apply Big Brother fixer + re-verify ☐
Triage BB findings (real vs. false positive), apply the fixer for the real ones, re-run the
full regression (Go suite, hardhat, SDK E2E, soak, adversarial). No fix lands without a
green re-test.
**Checkpoint:** all real findings fixed; full regression green again.

### CP6 — Consolidation ☐
Update docs with CP3–CP5 outcomes; commit + push; final status report; clear go/no-go
recommendation tied to the CP2 validation results.
**Checkpoint:** everything committed; project state coherent.

---

## Hard rule (panel mandate)

Do **not** spend net-new engineering budget beyond CP3 hardening until CP2 returns:
(1) a legal opinion that the target-jurisdiction path is survivable, and (2) at least one
paying or LOI-committed design partner. If CP2 comes back negative → **pivot or shelve**,
do not keep polishing the protocol.
