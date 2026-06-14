# Concept — Anonymity set & amount policy (fills the cold-start gap)

**Why:** the ZK proof hides the *graph*, but **amounts and crowd size decide real privacy**
(STRESS_TEST §0.4, §6, §8). An empty or invoice-exact pool provides ~0 unlinkability even
with perfect cryptography. Quantified by `sim/anonymity-set.mjs` (amount-matching adversary).

## Simulation result (run it: `node sim/anonymity-set.mjs`)

Anonymity set = the crowd a withdrawal is confusable with under an adversary that matches
public amounts. `%uniquelyLinkable` = withdrawals an adversary pins to one source.

| Amount policy | 50 users | 200 users | 1000 users | 5000 users |
|---------------|----------|-----------|------------|------------|
| **EXACT** (invoice 2-dp) | 99% uniquely linkable | 96% | 86% | **67%** |
| **DENOMINATED** (snap to round) | 0.6% / median set 6 | 0% / 22 | 0% / 103 | 0% / 516 |
| **SPLIT** (standard denominations) | 0% / median set 22 | 0% / 84 | 0% / 429 | 0% / 2146 |

Minimum live crowd for ~0% uniquely-linkable: **EXACT → >5000 (fails)**, **DENOMINATED →
~50**, **SPLIT → ~50**.

## Two hard conclusions

1. **Amount is the deanonymizer.** With exact invoice amounts, the cryptography is wasted —
   most withdrawals are uniquely linkable even at 5000 users. **The protocol MUST denominate
   or split amounts** (express every value as standard denomination notes), exactly as
   Tornado-style systems do. This is a *product/protocol requirement*, not optional.
2. **There is a hard cold-start floor.** Even with SPLIT/DENOMINATED, meaningful privacy
   needs **≥~50 concurrent active participants**, and a comfortable set (median ≥ ~80)
   needs **~200**. Below that, do not market "privacy."

## Design implications

- **Adopt SPLIT denominations** for shielded amounts (the SDK already supports multi-note
  outputs; standardize them to a denomination ladder). Change notes can stay arbitrary, but
  the *transacted* value should be denomination-bucketed.
- **Launch gated until the crowd exists.** Seed initial liquidity/activity (DFX-operated
  decoy/treasury flow, or a closed pilot cohort) to clear ~50–200 concurrent actives before
  claiming privacy. Until then, label the pilot honestly ("limited anonymity set").
- **Batching/timing.** Add relayer batching + randomized delay to blunt timing correlation
  (a second-order leak this sim does not model).
- **Tension with pool rotation** (see POOL_ROTATION.md): more pools/lanes → smaller crowds.
  Keep deposits in one active pool for set size; rotate only at real capacity.

## Honesty note

This is an indicative model of the dominant (amount) leak, not a full privacy proof. Timing,
network metadata, and graph analysis are additional leaks. A formal anonymity analysis is
part of the external audit scope.
