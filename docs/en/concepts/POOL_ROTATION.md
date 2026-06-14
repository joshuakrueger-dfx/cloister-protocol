# Concept — Pool rotation / multi-pool (fills the 2²⁰ capacity ceiling)

**Why:** each pool's Merkle tree is fixed depth `levels = 20` → ~1.05M leaves (≈524k 2-out
txs) per lane, ×`numLanes`. At scale this fills (STRESS_TEST §7). Increasing depth raises
proving cost; the answer is horizontal, not deeper trees.

## Options

1. **Lanes (already built).** `numLanes` independent roots multiply capacity and enable
   parallelism. With 8 lanes: ~8M leaves. First lever, already in the contract.
2. **Pool rotation.** When a pool nears capacity, deploy a fresh pool (same verifier/keys)
   and route new deposits there. Old pool stays spendable (withdraw-only). Wallets track
   which pool holds each note. The `PoolRegistry` already supports `chainId+asset → pool`
   and a visible `migrate`.
3. **Multi-pool routing in the SDK.** The wallet holds notes across pools; `buildTransaction`
   targets the pool a note lives in; new outputs go to the current active pool.

## Privacy interaction (important)

Splitting liquidity across pools/lanes **shrinks each pool's anonymity set**. There is a
direct tension: capacity wants many pools, privacy wants one big set. Policy:
- Prefer **filling lanes within one pool** before rotating to a new pool.
- Rotate only at genuine capacity; keep the active deposit pool singular for set size.
- Quantify the trade-off with the ANONYMITY_SET simulation before choosing rotation points.

## Status

Not needed for a pilot (1M+ tx capacity per lane is far beyond pilot volume). Documented so
scaling doesn't later force an anonymity-shrinking decision by accident. Build only when
volume approaches a lane's capacity.
