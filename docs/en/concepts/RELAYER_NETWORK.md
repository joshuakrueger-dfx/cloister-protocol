# Concept — Relayer network (fills the relayer-centralization gap)

**Why:** a single relayer is a deanonymization point (sees submission patterns), a liveness
SPOF, and a censorship lever (STRESS_TEST §0.7, §10.10). The SDK already abstracts this:
`submitShielded` takes a **list** of relayer endpoints, is idempotent, retries, and has an
opt-in direct-RPC fallback. This concept defines the network around that.

## Model

- **Open relayer set.** Anyone can run a relayer; the wallet picks N from a published list
  (config) and races/retries across them. No single relayer is trusted for liveness.
- **Sender privacy.** The relayer is `msg.sender`; it pays gas and the user's address never
  touches the chain. Multiple independent relayers → no single party sees all of a user's txs.
- **Fee/incentive.** The relayer is paid via the in-circuit `fee` (already a bound public
  signal, paid to `extData.relayer` on-chain). The wallet picks the lowest-fee live relayer.
  No protocol token needed.
- **Censorship resistance.** If all relayers censor (or are down), the user falls back to
  **direct submission** (opt-in; reveals sender but guarantees the payment completes) — the
  "can't-be-stuck" guarantee.
- **Anti-grief.** Relayers simulate the tx before broadcast (cheap) and only pay gas for
  txs that will succeed; the idempotency check prevents double-broadcast cost.

## Privacy caveat (be honest)

Multiple relayers reduce, not eliminate, metadata leakage: a relayer still sees the
proof+calldata+timing of the txs it handles. True unlinkability still depends on the
**anonymity set** (see ANONYMITY_SET.md), not the relayer.

## Test (when built)

Run ≥3 independent relayer instances; kill 2 mid-flow and confirm the payment still lands
via the third; confirm direct fallback lands when all 3 are down. (The submit-layer logic
is already unit-shaped for this.)
