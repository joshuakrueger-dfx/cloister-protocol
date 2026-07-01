# MASTERPLAN — Security Hardening (execution plan for an implementing agent)

> **Zweck (DE).** Umsetzbarer Masterplan für die aus dem Vier-Schichten-Security-Review
> (Contracts · ZK-Circuit · SDK · API/Web) abgeleiteten Härtungen. Kein Fund-Loss-Bug ist
> offen; dies sind Härtung, Liveness/DoS-Fixes und Test-Lücken. Der Plan ist so geschrieben,
> dass ein Agent (Opus 4.8) ihn **Arbeitspaket für Arbeitspaket** autonom abarbeiten kann.
>
> **Purpose (EN).** Self-contained, checkpointed implementation plan. Every work package lists
> the exact files + line anchors, the precise change spec, every cross-language sync point,
> the tests to add, the verification command, and a binary Definition of Done.

Status key: ☐ todo · ◐ in progress · ☑ done. Update the checkbox in this file as you land each WP.

> **Execution log (2026-07-01, this sandbox). All four Track-A WPs implemented.**
> - ☑ **WP-A3** landed + verified locally (`pnpm --filter @cloister/sdk test` green, 4 new tests).
> - ☑ **WP-A4** landed + verified locally (`go test -race ./zk/` green, 3 new test groups).
> - ☑ **WP-A2** landed. Cap now shares the emergency-pause duty cycle (auto-expiry + cooldown), so
>   `setMaxWithdrawal(dust)` can't permanently freeze. Verified: offline `solc 0.8.26` compile
>   clean (Hardhat's own solc download is egress-blocked, so the full guards suite runs in CI).
> - ☑ **WP-A1** landed, with one **design refinement**: the domain binds **chainId + lane** (not
>   `address(this)`). Binding the pool address would couple the *static* real-proof E2E fixture to
>   a deterministic deploy address and break the multi-pool negative tests (they share one fixture
>   proof across pools at different addresses). chainId + lane closes the two vectors the review
>   cared about operationally — cross-chain replay and the lane front-run griefing. Cross-pool
>   same-chain replay (pool-address binding) is deferred to the pre-ceremony re-key window, where
>   the verifier is redeployed and the fixture is rebuilt with a deterministic address anyway.
>   Verified: **SDK==Go byte-exact** for the new preimage (direct parity test), KAT re-anchored +
>   domain cases green, contract compiles clean, `provefromleaves` builds. **JS==Solidity** follows
>   from identical ABI encoding (same basis as the pre-WP-A1 golden).
>   - **One follow-up needed in a keys+solc environment:** regenerate the committed E2E fixture so
>     its bound `extDataHash` uses the new formula —
>     `REGEN_FIXTURE=1 FIXTURE_CHAIN_ID=31337 node test/gen-transact-fixture.js` (needs `keys/`).
>     Until then the contracts job's positive "deposits via transact" case is red (old un-domained
>     hash); the negative cases (incl. the new lane-replay test) already hold. This is the only
>     red item and it is a one-command operator step, not a code fix.

---

## 0. Ground rules (read before touching anything)

1. **Branch.** All work lands on `claude/goal-optimization-review-20p4w3`. Create it from the
   latest default branch if needed. Commit per work package with a descriptive message. Push with
   `git push -u origin claude/goal-optimization-review-20p4w3`. Do **not** open a PR unless asked.
2. **CI must stay green.** The gate is `.github/workflows/ci.yml` (Go prover+circuit race tests,
   ceremony roundtrip, SDK KAT + constants, SDK↔proverd e2e, Hardhat contracts, Slither-high).
   Run the relevant suite locally after every WP; never commit a red tree.
3. **The two-track rule is the core of this plan — obey it.**
   - **Track A (ship now):** contract + SDK + tests only. **No circuit change, no re-key.** These
     are independently deployable and CI-gated.
   - **Track B (do NOT execute now):** anything that changes the gnark circuit (new constraint or
     new public signal) invalidates the proving/verifying keys and forces a verifier redeploy.
     Per `docs/en/audit/CEREMONY_RUNBOOK.md` and `AUDIT_SCOPE.md`, circuit changes MUST be
     **bundled into one re-key cycle that runs immediately before the MPC ceremony**, together
     with any auditor soundness finding — never piecemeal. Track B here is a **frozen spec**, not
     a task to run in this pass.
4. **Domain separation is deliberately a Track-A (contract+SDK) change, not a circuit change.**
   `extDataHash` is a public input the circuit binds *without* constraining (see `circuit.go:113-121`
   — "any other consumer MUST recompute the hash"). Folding `chainId`, pool address and `lane`
   into that hash is done in Solidity + JS + the Go CLI that computes it; the circuit is untouched
   and no re-key is needed. This is why WP-A1 is safe to ship now.
5. **When you change the extData hash preimage, you MUST update every place that computes it, in
   lockstep, or all proofs silently fail to verify.** The authoritative list is in WP-A1 §"Sync
   points". The cross-language KAT (`packages/sdk/test/extdata.kat.test.mjs`) is your regression
   anchor — regenerate its golden and keep SDK == Go == Solidity byte-exact.
6. **Language.** Code identifiers, comments, tests and commit messages in English. `docs/en/*`
   is the source of truth; mirror any doc change into `docs/de/*` only if a DE counterpart exists.
7. **Do not** commit proving keys, `.env*`, or secrets. Do not weaken TLS or unset `HTTPS_PROXY`.

---

## 1. Track A — ship-now work packages

### WP-A1 ◐ — Domain + lane binding via `extDataHash` (closes contract M-1 cross-pool/chain replay + lane-replay griefing)

**Findings:** Contract review M-1 (`ShieldedPool.sol:246`, `:252-263`) — no `chainId`/pool-address
in the proof, so a proof replays on any pool sharing `(lane, oldRoot)` with unspent nullifiers.
Contract review §2 — `lane` is not bound, so a valid proof for lane A also verifies for lane B
while roots coincide (front-run griefing; the victim's tx then reverts on the consumed nullifier).
Circuit review §3 confirms the same at the hash layer.

**Design (chosen): bind the context into `extDataHash`; no new public signal, no re-key.**
Change the hash preimage everywhere from
`keccak256(abi.encode(extData)) % FIELD_SIZE`
to
`keccak256(abi.encode(extData, block.chainid, address(this), lane)) % FIELD_SIZE`.
A proof is then cryptographically pinned to one chain, one pool, and one lane. Replaying it
anywhere else makes the on-chain recomputed `extDataHash` differ from the proof's bound public
input → `verifyProof` returns false → revert. The circuit still just binds `ExtDataHash` as-is.

**Exact edits:**

1. **Solidity — `packages/contracts/contracts/ShieldedPool.sol:246`.** Replace
   `uint256 extDataHash = uint256(keccak256(abi.encode(extData))) % FIELD_SIZE;`
   with
   `uint256 extDataHash = uint256(keccak256(abi.encode(extData, block.chainid, address(this), lane))) % FIELD_SIZE;`
   (`lane` is already the first parameter of `_transact`; `transact` passes `0`, `transactLane`
   passes the caller lane — both correct.) Update the code comment near `:250` to state the new
   preimage and that it also domain-separates by chain/pool/lane.

2. **SDK — `packages/sdk/src/witness.js:18-25` (`encodeExtData`).** Add required params
   `chainId`, `poolAddress`, `lane` and extend the ABI encoding to match Solidity's
   `abi.encode(tuple, uint256, address, uint256)` exactly:
   ```js
   export function encodeExtData(extData, { chainId, poolAddress, lane }) {
     const coder = AbiCoder.defaultAbiCoder();
     const encoded = coder.encode(
       [EXT_DATA_ABI, "uint256", "address", "uint256"],
       [[extData.recipient, extData.extAmount, extData.relayer, extData.fee,
         extData.encryptedOutput1, extData.encryptedOutput2],
        chainId, poolAddress, lane],
     );
     return BigInt(keccak256(encoded)) % FIELD_SIZE;
   }
   ```
   Thread `chainId`/`poolAddress` into `buildWitness` (`witness.js:46-60`, which already has `lane`)
   as required inputs and pass them at the `encodeExtData(extData, …)` call at `witness.js:143`.
   Every `buildWitness` caller (SDK, `apps/demo`, `packages/api`) must now supply chain id + pool
   address — grep for `buildWitness(` and update call sites; fail loudly (throw) if missing rather
   than defaulting, so a forgotten call site can't silently produce chain-agnostic proofs.

3. **Go CLI that computes the hash — `packages/prover-gnark/cmd/provefromleaves/main.go:164-168`.**
   Extend the `crypto.Keccak256(encoded)` preimage identically (append `chainID`, pool address,
   `lane` with matching ABI packing). The Go paths that *receive* `extDataHash` as JSON input
   (`mobile/mobile.go`, `cmd/depositclient`, `cmd/emitscenario`, `onchain/submit.go`) do **not**
   compute it and need no formula change — but the caller that builds their input JSON must now
   supply the domain-bound value.

**Sync points (all must produce the identical field element for the same inputs):**
- `ShieldedPool.sol` `_transact` (authoritative, on-chain).
- `packages/sdk/src/witness.js` `encodeExtData` (witness input + relayer submit path).
- `packages/prover-gnark/cmd/provefromleaves/main.go` (dev prove-and-submit).
- Regenerate the fixture `packages/contracts/test/testdata/transact.json` (the real-proof E2E
   deposit vector consumed by `ShieldedPool.transact.e2e.test.js`) so its bound `extDataHash`
   matches the new formula. This fixture is the golden anchor the KAT references.
- Update the KAT golden in `packages/sdk/test/extdata.kat.test.mjs:19-31`: the `FIXTURE_EXTDATA`
   must now include a fixed `chainId`/`poolAddress`/`lane`, and `GOLDEN` must be recomputed from
   the regenerated fixture. Keep the "any field change moves the hash" property test; add cases
   proving a **chainId change**, a **poolAddress change**, and a **lane change** each move the hash.

**Tests to add:**
- `packages/contracts/test/` — a **lane-replay** test: build/verify a proof for lane 1 via
   `transactLane`, then attempt to submit the identical proof+extData on a different lane → expect
   `"invalid proof"`. (Needs a real or fixture proof; reuse the E2E harness.)
- A **cross-pool replay** test: deploy two `ShieldedPool` instances sharing verifier/token; a proof
   valid on pool A must revert on pool B (`"invalid proof"`), even at genesis-equal roots.
- KAT domain cases as above.

**Verify:**
`pnpm --filter @cloister/sdk test` (KAT green) · `pnpm --filter @cloister/contracts test`
(E2E + new replay tests green) · `cd packages/prover-gnark && go test ./...` (unaffected, still green).

**DoD:** identical `extDataHash` across Solidity/JS/Go for a shared input vector (proven by the
regenerated KAT + live E2E), lane-replay and cross-pool replay tests fail the attack and pass the
suite, CI green.

---

### WP-A2 ☑ — Close the `setMaxWithdrawal` freeze bypass (contract Medium)

**Finding:** Contract review finding #1 — `ShieldedPool.sol:335` `setMaxWithdrawal` has no lower
bound, no timelock, no auto-expiry. A compromised guardian calls `setMaxWithdrawal(1)` and every
non-dust withdrawal reverts `"withdrawal over cap"` **indefinitely**, defeating the explicit
no-permanent-freeze guarantee that `emergencyPause`'s cooldown (`:318-332`) was built to provide.

**Design (chosen): give the cap the same duty-cycle guarantee as the emergency pause.** Mirror the
existing lazy-expiry pattern so a *lowered* cap cannot become a permanent freeze:
- Raising the cap or setting it to `0` (unlimited) — i.e. **less restrictive** — applies
   immediately, no cooldown. Emergency tightening-down remains fast.
- Lowering the cap (more restrictive) applies immediately **but auto-expires** after
   `MAX_EMERGENCY_PAUSE`, and re-arming a lower cap is gated by `PAUSE_COOLDOWN`, exactly like
   `emergencyPause`. So the pool can never be kept in a low-cap state back-to-back.

**Implementation sketch (new state + lazy read, no cron):**
```solidity
uint256 public maxWithdrawalUntil;   // 0 = cap is permanent (only for raises/removal)
uint256 public capCooldownEnds;      // earliest a new *lowering* may be armed

function setMaxWithdrawal(uint256 cap) external onlyGuardian {
    bool lowering = cap != 0 && (maxWithdrawal == 0 || cap < _effectiveCap());
    if (lowering) {
        require(block.timestamp >= capCooldownEnds, "cap on cooldown");
        maxWithdrawalUntil = block.timestamp + MAX_EMERGENCY_PAUSE;
        capCooldownEnds    = maxWithdrawalUntil + PAUSE_COOLDOWN;
    } else {
        maxWithdrawalUntil = 0; // raise/removal is permanent, no auto-revert
    }
    maxWithdrawal = cap;
    emit MaxWithdrawalSet(cap);
}

function _effectiveCap() internal view returns (uint256) {
    if (maxWithdrawal != 0 && maxWithdrawalUntil != 0 && block.timestamp >= maxWithdrawalUntil)
        return 0;            // a lowered cap has auto-expired → unlimited again
    return maxWithdrawal;
}
```
Then in `_transact` (`:242-244`) use `_effectiveCap()` instead of the raw `maxWithdrawal`.
Keep the finding-#3 note in mind: the cap covers only `|extAmount|`, not `fee`; optionally also
cap `uint256(-extAmount) + fee` in the same edit (small, defense-in-depth — do it if it doesn't
complicate the withdrawal accounting; otherwise document as accepted).

> Alternative (simpler, acceptable if the above is deemed too much state): a plain timelock —
> `proposeLowerCap(cap)` records pending+timestamp, `applyLowerCap()` enacts after a delay;
> raises stay instant. Pick this only if you also state in the contract comment that emergency
> tightening now carries a delay. The mirror-the-pause design above is preferred because it keeps
> emergency tightening instant *and* guarantees no permanent freeze.

**Tests to add** (`packages/contracts/test/guards.test.js` alongside the existing cap happy-path):
- Guardian lowers cap → large withdrawal reverts; after `MAX_EMERGENCY_PAUSE` (evm time-warp) the
   cap auto-expires and the same withdrawal succeeds.
- Re-arming a lower cap before `capCooldownEnds` reverts `"cap on cooldown"`.
- Raising / removing the cap is instant and never on cooldown.

**Verify:** `pnpm --filter @cloister/contracts test`.

**DoD:** a guardian can throttle withdrawals for incident response but provably cannot hold them
throttled permanently; new tests green; CI green; `docs/en/SECURITY.md` residual-risk note updated
to reflect the cap now shares the pause duty-cycle guarantee.

---

### WP-A3 ☑ — SDK Merkle-sync integrity guards (SDK Medium ×2)

**Findings:** SDK review #1 (`packages/sdk/src/sync.js:13-14`, `:36-37`) — the sync loop never
asserts leaf **contiguity**; one missing leaf from a buggy/malicious indexer shifts every later
commitment's tree position, permanently desyncing the local root (silent DoS). SDK review #2
(`packages/sdk/src/witness.js:146`) — `buildWitness` assumes an **even** tree length; an odd
length makes `pairIndex` fractional and produces a malformed, unverifiable witness.

**Exact edits:**

1. **`sync.js` — enforce contiguity in both sync paths.** In `syncFromIndexer` (after the
   `if (e.leafIndex < tree.leaves.length) continue;` dedup at `:13`) and identically in
   `syncFromChain` (`:36`), coerce and assert before insert:
   ```js
   const idx = Number(e.leafIndex);
   if (idx < tree.leaves.length) continue;      // already synced
   if (idx !== tree.leaves.length)              // gap → refuse to corrupt the tree
     throw new Error(`leaf gap at ${tree.leaves.length}, got ${idx}`);
   tree.insert(e.commitment);
   ```
   A throw from `syncFromIndexer` already falls through to the next indexer / chain-scan in
   `syncWithFallback` (`:57-68`) — good, keep that behavior. Also `Number()`-coerce `leafIndex`
   before the `sort` comparators (`:9`, `:32`) so string/NaN inputs can't reorder silently.

2. **`witness.js` — guard even length.** At the top of `buildWitness` (after destructuring, before
   any use of `tree`), add:
   ```js
   if (tree.leaves.length % 2 !== 0)
     throw new Error(`buildWitness requires an even leaf count, got ${tree.leaves.length}`);
   ```

3. **(Optional, SDK review #3) Multi-lane index mapping.** The on-chain `NewCommitment.leafIndex`
   is the **global** index `lane·2^levels + local` (`ShieldedPool.sol:272`), but sync/`note.index`
   treat it as local — correct only for lane 0. Either (a) document at the top of `sync.js` that the
   SDK currently supports lane 0 only and assert `lane === 0` on the sync entry points, or (b) map
   global→local by subtracting `lane * 2**levels`. Prefer (a) now (cheap, honest); leave (b) for
   when multi-lane wallets are actually built. Do not silently ship the broken multi-lane path.

**Tests to add** (`packages/sdk/test/`, `node --test`):
- Feed `syncFromChain`/`syncFromIndexer` a mocked event list with a gap (`[0,1,3]`) → expect throw,
   and the tree left uncorrupted.
- Call `buildWitness` with an odd-length tree → expect the even-count throw.

**Verify:** `pnpm --filter @cloister/sdk test`.

**DoD:** a gap or odd length fails fast with a clear error instead of silently desyncing; new tests
green; existing SDK KAT + e2e still green.

---

### WP-A4 ☑ — Circuit soundness test hardening (circuit review §1 — test rigor, **no circuit change**)

**Finding:** Circuit review §1 — the under-constrained hunt and negative tests have blind spots on
the highest-value properties. This WP adds tests only; it does **not** modify `circuit.go` (that
would be Track B). Files: `packages/prover-gnark/zk/property_test.go`, `soundness_test.go`,
`hash_test.go`.

**Tests to add:**
1. **Non-member input rejected.** A genuinely non-member note (valid commitment, but a Merkle path
   that does not climb to `Root`) with a **nonzero** amount must make the circuit unsatisfiable
   (proof fails). Currently only the roots are bumped; exercise a real bad path.
2. **Non-good-set note rejected.** Same, for the ASP association path vs `AssociationRoot`.
3. **`isReal` dummy crux.** A **nonzero-amount** input marked as a dummy (skipping membership) must
   be rejected — this gates `circuit.go:88-94`, the single most security-critical branch, and is
   currently untested in isolation. Assert it cannot be satisfied.
4. **Poseidon2 arity KATs.** Add explicit native==circuit known-answer tests for the **1-arity**
   `H(priv)` and **3-arity** commit/sig/nullifier hashes (only 2-arity is pinned today at
   `hash_test.go` / `soundness_test.go:84`).
5. **Under-constrained hunt breadth.** Extend the mutation in `property_test.go:148-179` beyond
   `InPathEls[0][0]` / `InAssocEls[0][0]` to at least one deeper level and to input index 1, so the
   "all bound except ExtDataHash" claim is actually exercised across the arrays.

**Verify:** `cd packages/prover-gnark && go test ./... -race` (the CI uses race + the
under-constrained job).

**DoD:** the four soundness properties above are directly asserted by passing tests; `go test ./...`
green with race; CI's prover job green.

---

## 2. Track B — pre-ceremony circuit re-key bundle (FROZEN SPEC — do NOT execute in this pass)

> These change the gnark circuit and therefore the proving/verifying keys and the on-chain
> verifier. Per `docs/en/audit/CEREMONY_RUNBOOK.md:14-16` and `AUDIT_SCOPE.md:138-151`, they land
> **as one bundle, after the external audit's soundness findings are known, immediately before the
> MPC ceremony**, followed by `Groth16Verifier.sol` regeneration + redeploy. Doing any of them now
> would waste a re-key. Capture them here so the bundle is ready.

- **B1 — `publicAmount` in-circuit range check (open finding #8).** Add an explicit range
   constraint on `PublicAmount` in `circuit.go:111` region. Today it is safe only because in/out
   amounts are 248-bit bounded and the **contract recomputes** the value (`ShieldedPool.sol:299-305`);
   any other proof consumer would be exploitable. Cheap defense-in-depth; forces a re-key → Track B.
- **B2 — bind global leaf index into the nullifier (circuit review §4).** Nullifier currently binds
   the *local* index while the pool nullifier set is global; uniqueness rests on blinding entropy.
   Binding the global index makes cross-lane uniqueness structural. Circuit change → Track B.
- **B3 — optional in-circuit domain/version tag in note hashes (circuit review §3, §5).** The
   contract-side chain/pool/lane separation is handled in WP-A1; a version tag inside the note
   commitment/nullifier hashes is a deeper, re-key-only hardening — fold in only if an auditor asks.
- **B4 — any auditor soundness finding** from the external circuit audit.

**Bundle sequencing gate (from the runbook):** freeze circuit → external audit sign-off →
regenerate keys via the MPC ceremony (`cmd/ceremony`, already built & CI-tested) → export &
redeploy `Groth16Verifier.sol` → re-run full regression (Go + Hardhat + SDK e2e + soak) →
reconcile deployment descriptors. **None of this is in scope for the current pass.**

---

## 3. Execution order & checkpoints

Do Track A in this order; each is an independent commit and can be pushed as it goes green:

1. **WP-A3** (SDK guards) — smallest, no cross-language coordination, warms up the SDK suite.
2. **WP-A2** (maxWithdrawal anti-freeze) — contract-only, isolated to `ShieldedPool` + guards test.
3. **WP-A4** (circuit soundness tests) — Go-only, no source change.
4. **WP-A1** (domain+lane binding) — **last**, because it touches Solidity + SDK + Go + two golden
   fixtures in lockstep and is the highest-coordination change; land it once the rest is green so a
   KAT/fixture regression is unambiguous.

After each WP: run its Verify command, then commit. After all four: run the **global matrix** below,
then push the branch.

---

## 4. Global verification matrix (run before the final push)

```bash
# SDK: KAT (incl. new domain cases) + sync guards + e2e
pnpm --filter @cloister/sdk test

# Contracts: guards, real-proof E2E (regenerated fixture), replay + cap tests
pnpm --filter @cloister/contracts test

# Prover + circuit: race + under-constrained hunt + new soundness tests + ceremony roundtrip
cd packages/prover-gnark && go test ./... -race && cd -

# Constants consistency (mirrors the pre-push hook / CI)
bash .githooks/pre-push || true   # inspect output; must not report drift
```
All green ⇒ the branch matches what `.github/workflows/ci.yml` will enforce. If any circuit test
now fails because a Track-B item leaked in, revert that item — Track B does not ship here.

---

## 5. Definition of done (whole plan)

- ◐ WP-A1 domain+lane binding landed; SDK==Go==Solidity KAT byte-exact; lane-replay & cross-pool
   replay attacks fail; fixture + golden regenerated.
- ☑ WP-A2 cap can throttle but never permanently freeze; auto-expiry + cooldown tested.
- ☑ WP-A3 leaf-gap and odd-length both fail fast; tested.
- ☑ WP-A4 non-member / non-good-set / isReal-dummy / arity-KAT soundness tests all present & green.
- ☐ Full global matrix green; branch pushed to `claude/goal-optimization-review-20p4w3`.
- ☐ `docs/en/SECURITY.md` (and `docs/de/SECURITY.md` if present) updated: M-1/lane replay closed
   via extData domain binding, cap now shares the no-permanent-freeze guarantee, SDK sync hardened.
- ☐ Track B captured here as a frozen bundle; **not** executed. No circuit/key/verifier change in
   this branch.

---

## 6. Appendix — the domain-bound extData encoding (authoritative)

For any input vector, all three implementations MUST yield the same field element:

```
extDataHash = keccak256(
    abi.encode(
        (recipient, extAmount, relayer, fee, encryptedOutput1, encryptedOutput2),  // the ExtData tuple
        block.chainid,   // uint256
        address(this),   // address of the ShieldedPool instance
        lane             // uint256
    )
) mod FIELD_SIZE
```

- Solidity: `keccak256(abi.encode(extData, block.chainid, address(this), lane)) % FIELD_SIZE`.
- JS (ethers): `AbiCoder.encode([EXT_DATA_ABI, "uint256", "address", "uint256"], [tuple, chainId, pool, lane])`.
- Go: `crypto.Keccak256(abiPack(tuple, chainID, pool, lane))` then `mod fr.Modulus()`.
- `FIELD_SIZE = 21888242871839275222246405745257275088548364400416034343698204186575808495617`.
- The circuit does **not** change: it binds `ExtDataHash` as public input `pub[2]` and leaves the
   preimage to the on-chain recompute (`circuit.go:113-121`). The KAT is the regression anchor.
