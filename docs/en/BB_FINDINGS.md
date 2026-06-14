# CP4/CP5 — Big Brother review + findings

## What Big Brother did

Ran the local Ultra Test-Agent ("Big Brother", `~/TestAgentSystem`, provider=claude,
REAL-RUN) against a **clean git worktree of `main`** (non-invasive; the working tree had
the user's concurrent web/KYC WIP, which was left untouched).

- Healthcheck: operational.
- Preflight + baseline: passed on the clean, branched worktree (detached-HEAD and
  dirty-tree both correctly rejected first — fixed by branching the worktree).
- **Classification (real BB output):** `primary_kind: smart_contract`; capabilities
  `smart_contract, source_logic`; toolchain `node`; **required gates: `contract`,
  `latent-logic`**; recommended `companion-pr`. (`capability-profile.{md,json}`.)
- Gate routing: `smart_contract → test-agent-contract-gate (mandatory)`.

**Limitation (honest):** the deep gate agents (`contract-gate`, `latent-logic-gate`) need a
dependency-provisioned checkout (node_modules, `hardhat compile`). The clean worktree has
no installed deps, so the gates could not execute to a full verdict. This is an
environment-provisioning limitation of running BB on a throwaway worktree, **not** a code
finding. The substantive defect search was therefore completed via the equivalent
BB-mandate review below (the same Tester/Fixer mandate, run against the real tree where the
tests already pass).

## Findings (BB-mandate review)

| # | Finding | Severity | Status |
|---|---------|----------|--------|
| F1 | `proverd` bound all interfaces (`:8799`); it sees the private witness and should not be LAN-exposed | Low (dev-only) | **Fixed** — defaults to `127.0.0.1:8799`; explicit host overrides |
| F2 | `submitShielded` idempotency check silently no-ops when `rpcUrls` is empty | Low | Documented (caller must pass `rpcUrls` for the anti-double-submit guarantee) |
| F3 | Direct-RPC fallback reveals the sender | Info | By design; opt-in (`allowDirect`), off by default, documented in FALLBACKS |
| F4 | `deployAll` always deploys `MockERC20` | Info | By design for testnet; DEPLOYMENT mainnet checklist mandates the real asset token |
| F5 | Circuit `AssertIsEqual(ExtDataHash, ExtDataHash)` looks like a no-op | Info (not a bug) | Groth16 binds all declared public inputs; binding empirically confirmed by the adversarial "extData tampered → revert" test |

No correctness or fund-safety defect was found beyond F1. The high-risk surfaces
(conservation, double-spend, off-chain insertion, extData binding, reentrancy/CEI,
fee-on-transfer) are covered by the 12 contract tests, the 1000-tx soak, and the 7/7
adversarial battery, all green.

## Fix applied

- **F1**: `packages/prover-gnark/cmd/proverd/main.go` now binds `127.0.0.1:8799` by default.

## Re-verification (CP5)

After the fix, the full regression was re-run (see VALIDATION.md): Go suite, contract suite
(12/12), SDK E2E. All green; the proverd change is a bind-address default only and does not
touch the proving/verifying path.
