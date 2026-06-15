# Cloister Protocol — Base Mainnet Readiness Audit

Date: 2026-06-15 · Scope: shielded-payment protocol (DFX AG) · Target: 100,000 users/day on Base mainnet
Subsystems audited: contracts, circuit, prover, mobile/on-chain, relayer/api, sdk, wallet, licenses, docs, build.

Severities reflect the post-adversarial-review verdicts: findings whose adversarial verdict was `real:false` are excluded from the blocker lists; findings the review demoted (e.g. P0→P1, P1→P2) are listed at the demoted severity.

---

## 1. Executive summary — NO-GO for Base mainnet

**Recommendation: NO-GO.** The protocol is a well-built proof-of-concept on Base Sepolia testnet, but it is not safe to hold real value at any scale, let alone 100k users/day. There are three categories of hard blockers that must be closed before mainnet:

1. **Trust root is unsafe.** The Groth16 proving/verification keys come from a single-party trusted setup (`groth16.Setup`) with unmanaged toxic waste. Whoever ran setup can forge proofs and mint/spend arbitrary shielded notes — total loss-of-funds. No multi-party ceremony, no transcript, no reproducibility, and no chain-id guard preventing the dev keys from being carried to mainnet.

2. **The shipped mobile wallet is unsafe and non-compliant.**
   - A shared embedded deployer private key (`EXPO_PUBLIC_CLOISTER_KEY`) is inlined into the app bundle and signs all deposits; the note-owner secret defaults to the constant `'12345'`. Loss-of-funds + privacy break.
   - The root route auto-authenticates (bypasses PIN/biometric) with no production gate.
   - go-ethereum (LGPL-3.0) is statically linked into the proprietary `Cloister.xcframework` shipped to the App Store — a live, distributed LGPL violation, while the repo declares itself GPL/copyleft-free.

3. **The system does not function at the stated load and is not real-asset-wired.** Per-lane single-root (no root-history window) serializes throughput; the relayer and SDK rebuild the Merkle tree from genesis via unpaginated `eth_getLogs` and recompute layers recursively per request; the "provider" mints an unbacked MockERC20 instead of settling real USDC.

The cryptographic core (value conservation, nullifier/double-spend handling, CEI ordering, extDataHash binding, MIT gnark verifier) was reviewed and found sound. The blockers are in key provenance, mobile key handling, compliance defaults, scalability, and licensing — all fixable, but all gating.

**Top reasons for NO-GO:** single-party trusted setup (forgeable proofs); shared embedded signing key + constant owner key in the shipped app; no global circuit-breaker on a novel unaudited verifier; LGPL go-ethereum statically linked into the proprietary binary; no real-asset wiring; no throughput model for 100k/day.

---

## 2. P0 blockers

> Only findings whose adversarial verdict confirmed `real` AND retained P0 are listed here.

### P0-1 · Single-party trusted setup — forgeable proofs / loss of all funds
- **Subsystem:** prover / build
- **File:** `packages/prover-gnark/cmd/setup/main.go:43-69` (esp. line 53 `groth16.Setup(cs)`)
- **Problem:** `groth16.Setup` draws fresh toxic waste (tau/alpha/beta/gamma/delta) in a single process. Whoever ran it can forge a valid proof for any public input — mint shielded notes from nothing or spend others' notes. No ceremony tooling, no transcript, no fixed RNG/reproducibility, and no chain-id gate. The committed `keys/vk.bin` + exported `Groth16Verifier.sol` would be carried to mainnet unless explicitly regenerated.
- **Fix:** Block mainnet on a verifiable multi-party Phase-2 ceremony (perpetual-powers-of-tau-derived or gnark MPC). Publish the full transcript + a deterministic verification script. Re-export `Groth16Verifier.sol` from the ceremony vk and re-audit. Gate `cmd/setup` behind `--insecure-singleparty` that refuses any chain-id other than Sepolia. Add a CI guard that fails if the deployed verifier matches the committed dev vk hash.

### P0-2 · go-ethereum (LGPL-3.0) statically linked into the proprietary iOS framework
- **Subsystem:** mobile-onchain / licenses
- **File:** `packages/prover-gnark/onchain/submit.go:16-22` (imports), reachable via `packages/prover-gnark/mobile/mobile.go:15,184`; shipped at `dfx-wallet/modules/cloister-prover/ios/Cloister.xcframework`
- **Problem:** `onchain/submit.go` imports six LGPL-3.0 go-ethereum packages. `mobile.go` imports `onchain` and calls `DepositAndSubmit`, so geth is compiled into the gomobile bind. `strings` over the shipped 37 MB framework shows thousands of go-ethereum symbols; it is shipped as a `static_framework` declared `Proprietary … All rights reserved` (podspec). LGPL-3.0 §4/§6 require relinkable objects/dynamic linking + license text + attribution — none present. This is a live, distributed LGPL violation, and `docs/LICENSES.md` falsely declares the stack "no GPL/copyleft code."
- **Fix:** Remove go-ethereum from the gomobile surface entirely. The prover only needs gnark/gnark-crypto (Apache-2.0) to PROVE. Move on-chain submission off-device: have the wallet broadcast `transact()` via the existing JS/TS + ethers (MIT) path / WDK-managed key using the proof the native prover returns. Then `go list -deps ./mobile` contains only Apache/BSD/MIT modules. Regenerate `LICENSES.md` mechanically from the actual linked set and correct the README "GPL-free" claims. (Resolves the prior `submit.go` LGPL finding and the `LICENSES.md` false-declaration finding — same root cause.)

### P0-3 · Shielded deposits signed by a single embedded shared key; owner key defaults to `'12345'`
- **Subsystem:** wallet
- **File:** `dfx-wallet/app/(auth)/pay/cloister.tsx:31` (`DEPLOYER_KEY = process.env.EXPO_PUBLIC_CLOISTER_KEY`), `:32` (`OWNER_PRIV … ?? '12345'`), `:99-107` (passed into `depositDirect`)
- **Problem:** `EXPO_PUBLIC_*` values are inlined into the JS bundle at build time, so the funding key ships in cleartext and every install signs with the same key — drainable. There is exactly one signing path; the comment claiming "production signs with the user's own wallet key" has no corresponding code. If `EXPO_PUBLIC_CLOISTER_OWNER` is unset, every user's shielded notes share the trivially-guessable owner key `'12345'` — full ownership/privacy break.
- **Fix:** Delete the embedded-deployer-key path before any mainnet build. Deposits must be signed by the user's own WDK-managed wallet key; the note-owner key must be derived per-user from the wallet seed (never a constant, never an env default). Add a build-time guard that fails the production build if `EXPO_PUBLIC_CLOISTER_KEY`/`EXPO_PUBLIC_CLOISTER_OWNER` are present. Treat the current testnet key as compromised and rotate/sweep it.

### P0-4 · Root entry route bypasses PIN/biometric auth (auto-auth) with no production gate
- **Subsystem:** wallet
- **File:** `dfx-wallet/app/index.tsx:16-22`
- **Problem:** The root route runs `setOnboarded(true); setAuthenticated(true)` in an unconditional `useEffect`, then redirects to the authenticated dashboard. The hard auth gate only checks the in-memory `isAuthenticated` flag, which is set true before any `(auth)` route renders, so `/(pin)/verify` is never reached. As written this ships device-unlock = full-wallet-access with no `FEATURES`/env gate. (One reviewer demoted to P2 on the grounds PIN is a deferred MVP feature; the other confirmed P0. Kept as a P0-class blocker because as written it unconditionally defeats any build that enables PIN, and there is no production guard.)
- **Fix:** Gate the auto-auth strictly behind a sideload-only flag that is provably off in production (`EXPO_PUBLIC_CLOISTER_SIDELOAD === '1'`), assert at build time the flag is unset for release builds, and add a test that a fresh launch with PIN enabled routes to `/(pin)/verify`. Better: remove it and run the real onboarding/PIN flow.

> **Excluded from P0** (adversarial verdict `real:false`): prover vk/contract "drift" (`cmd/setup` two-setup-runs) — refuted, the keys match the deployed verifier; only stale `build/Verifier.sol` artifact remains. The "fresh MockERC20 mint" finding (`server.js`) — refuted as a P0 since `server.js` is a localhost-only mock that cannot run against mainnet (carried as info under §4). The relayer plaintext-key, unauthenticated mint/DoS, and unpaginated-getLogs findings are real but were demoted (see §3/§5) because the relayer is a Base Sepolia testnet faucet, not the production relayer.

---

## 3. P1 issues

### P1-1 · No per-lane root-history window — in-flight proofs revert under concurrency
- **Subsystem:** contracts (scale) · **File:** `packages/contracts/contracts/ShieldedPool.sol:55,178,224`
- **Problem:** `laneRoot[lane]` stores exactly one current root; `_transact` hard-requires `oldRoot == laneRoot[lane]` then overwrites it. Any other same-lane tx advances the root, so a correctly-proven in-flight tx reverts ("stale or unknown root") and must be re-proven — wasting on-device proving. The contract already keeps a history mapping for ASP roots (`knownAspRoot`) but not for lane roots. (Demoted P0→P1: liveness/scalability, not fund-loss.)
- **Fix:** Add a bounded per-lane rolling root-history (e.g. `mapping(lane => mapping(root => bool))` + a FIFO of ~64-128 recent roots); accept `oldRoot` if it is any recent known root. Note: the proof also binds `pairIndex`/the exact insertion transition, so a stale root cannot be naively applied at a new slot — pair the history window with a relayer/sequencer that re-targets proofs (or move index assignment on-chain). Re-evaluate `numLanes` for mainnet.

### P1-2 · No kill-switch / withdrawal pause / upgrade path on a novel unaudited verifier
- **Subsystem:** contracts (security) · **File:** `packages/contracts/contracts/ShieldedPool.sol:36,41-43,257-265`
- **Problem:** `verifier` is `immutable`; the only Guardian power is `setDepositsPaused` (deposits only). Withdrawals are intentionally never blockable, and there is no per-tx/per-block withdrawal cap. If a soundness bug exists in the self-built gnark circuit or in the hand-repacked `TransactionVerifier`, the pool can be drained to zero with zero containment, and the privacy break is unrecoverable. `PoolRegistry.migrate` only repoints a lookup; it is not a recovery path.
- **Fix:** Add a time-boxed, auto-expiring emergency circuit-breaker (multisig Guardian, e.g. 72h pause of ALL transactions) that preserves the "never permanently freeze" property. Add per-tx and/or per-block aggregate withdrawal caps as defense-in-depth. Require an independent audit of the circuit + verifier vkey before mainnet.

### P1-3 · Circuit hard-codes `Levels=20`; pool accepts `levels ∈ [1,32]` — deploy mismatch bricks the pool
- **Subsystem:** circuit (correctness) · **File:** `packages/prover-gnark/zk/merkle.go:9`, `circuit.go:47-49,57,68`; `ShieldedPool.sol:102`
- **Problem:** The verifying key is fixed to a depth-20 tree, but the constructor accepts any `_levels` in [1,32] with no binding to the circuit. A pool deployed with `levels != 20` produces roots the depth-20 circuit cannot match — every honest proof fails to verify (functional DoS). (Demoted P0→P2 by both reviewers as a deploy-time misconfiguration; listed here as P1-class because it is a silent mainnet footgun with no guard.)
- **Fix:** `require(_levels == 20)` in the constructor, or generate the circuit from the same `levels` parameter; add a deploy-time assertion that on-chain `levels` equals the VK's embedded depth, and a test that exercises a depth mismatch.

### P1-4 · `syncTree` ignores lanes — merges all-lane commitments into a single tree (multi-lane deposit DoS)
- **Subsystem:** mobile-onchain (correctness) · **File:** `packages/prover-gnark/onchain/submit.go:86-142,169-196`
- **Problem:** `DepositDirect` always operates on lane 0, but `NewCommitment.leafIndex` is a GLOBAL index (`lane * 2^levels + …`) and the `FilterQuery` does not filter by lane. Once any lane>0 has commitments, foreign-lane leaves pollute the lane-0 reconstruction, the rebuilt root != on-chain `laneRoot(0)`, and the mismatch guard trips → deposits fail for everyone on a multi-lane deployment. (Demoted P0→P1: fail-closed, no fund loss; affects the designed-but-unused multi-lane feature.)
- **Fix:** Make `syncTree` lane-aware: keep only events where `leafIndex / 2^levels == lane` and re-base the local index, or add `lane` as an indexed event topic and filter on it. Add a test with a non-empty lane-1 alongside lane-0.

### P1-5 · Full tree rebuild + recursive layer recompute per deposit (on-device, on-chain submit path)
- **Subsystem:** mobile-onchain (scale) · **File:** `packages/prover-gnark/onchain/submit.go:78-142,195-196`; recursion in `zk/merkle.go:42-61,123-137`
- **Problem:** Every `DepositDirect` rebuilds the tree from genesis (`eth_getLogs` from deploy block, all logs accumulated in RAM), then `PairPath` calls the recursive `layer()` 19 times with no memoization (O(N·Levels²) Poseidon hashing), plus a full `Root()` pass in the guard. On a phone at large N this is minutes per deposit. (Note: tree capacity is `2^20 ≈ 1.05M` notes, so the year-of-logs figure overshoots, but the RAM / RPC-result-cap / on-device-hashing problem is real well before the ceiling.)
- **Fix:** Reuse the relayer-fed `ProveDeposit` path (constant-size `{root, pairIndex, pairPathEls}`) for `DepositDirect`. If a trustless local rebuild is required, persist the tree across calls, insert incrementally, and replace recursive `layer()` with a cached/iterative build computed once per sync.

### P1-6 · `submit.go` nonce + unbounded `WaitMined` — stale nonce on load-balanced RPC, infinite hang on dropped receipt
- **Subsystem:** mobile-onchain (correctness) · **File:** `packages/prover-gnark/onchain/submit.go:148,223-233,250`
- **Problem:** `ctx := context.Background()` is unbounded, nonce is fetched once via `PendingNonceAt` with no store/retry/replacement-gas, and `WaitMined` reuses the deadline-less ctx — a dropped/stuck tx blocks forever. On a load-balanced public RPC `PendingNonceAt` routinely returns a stale view; two in-flight deposits collide on nonce with no recovery. (One reviewer P1, one P2; the unbounded-hang half is independently P1.)
- **Fix:** Wrap submit/`WaitMined` in `context.WithTimeout`. Retry with bumped gas on nonce/replacement errors. Use a single sticky RPC node or a server-side nonce manager / account-abstraction; per-device `PendingNonceAt` cannot be made correct under sharing.

### P1-7 · Raw private keys cross the gomobile JSON boundary as plaintext strings
- **Subsystem:** mobile-onchain (security) · **File:** `packages/prover-gnark/mobile/mobile.go:94-101,160-168,184-188`
- **Problem:** `OwnerPriv` (spend key) and `DeployerKey` (funded EVM key) are accepted as plaintext JSON strings. Go strings are immutable/un-zeroable, so they linger in the heap; the witness/params JSON is exactly what gets logged at the JS/native bridge. A leaked spend key is a full privacy + funds compromise. (Demoted P0→P1: hardening + no current native callers, but lands before shipping.)
- **Fix:** Do not pass raw keys across the bridge. Sign/derive on the native side via Secure Enclave / Android Keystore and pass only a key handle or the minimum the circuit needs. If keys must transit, use a fixed-length `[]byte` zeroed after use; never log these args. Replace the shared on-device deployer key with a relayer / per-user account abstraction.

### P1-8 · `buildWitness` produces an invalid `pairIndex`/`newRoot` on odd leaf count (no guard)
- **Subsystem:** sdk (correctness) · **File:** `packages/sdk/src/witness.js:146-148`
- **Problem:** `pairIndex = tree.leaves.length / 2` assumes even length; `rootWith([out0,out1])` and the circuit's pair-insertion model only agree when length is even. On odd length the SDK silently produces a witness the circuit rejects, with no clear error. The chain always advances by 2 (so a faithfully-synced tree is even), but dev tooling / partial sync / the documented filler pattern can hit it. (Both reviewers demoted to P2 — fail-closed; listed as a robustness gap.)
- **Fix:** Assert `tree.leaves.length % 2 === 0` (pool and asp trees) at the top of `buildWitness`; reject a non-integer `pairIndex` in `MerkleTree.pairPath`; add a test that odd length throws a clear error.

### P1-9 · KYC sanctions screening uses a hardcoded ~18-name sample list
- **Subsystem:** relayer (correctness/compliance) · **File:** `packages/api/src/kyc.js:22-45,60-74`
- **Problem:** `screenApplicant` returns `verified` based on a hardcoded ~18-name list; the promised `loadFullSdn` does not exist. Real OFAC SDN / EU consolidated lists are never loaded, and the matcher has no fuzzy/alias/transliteration handling. For a regulated product this passes virtually every sanctioned party as verified. (Mitigant: in-repo this "verified" is not yet enforced as a gate, but the screening logic itself is wrong.)
- **Fix:** Integrate the licensed provider (DFX/Sumsub) and/or load + refresh the full OFAC SDN + EU lists with fuzzy/alias matching before any "verified" result. Do not let this regex sample gate real onboarding.

### P1-10 · `/v1/shielded/submit` auto-publishes any caller-supplied ASP root (compliance bypass)
- **Subsystem:** relayer (security) · **File:** `packages/api/src/server.js:185-197` (`ensureAspRoot` → `publishAspRoot`, lines 55-59)
- **Problem:** In `ASP_ENFORCE` mode the server (which holds the ASP authority) publishes ANY not-yet-known caller-supplied `associationRoot` on-chain via `publishAspRoot`. An attacker can build their own tree over non-vetted commitments, supply its root, generate a self-consistent proof, and have the relayer auto-publish it — defeating the on-chain compliance gate. `quoteId` is also marked "paid" with no binding to the on-chain commitment. (This is in the "mock provider" but is exactly the compliant relayer path that would carry to production.)
- **Fix:** Never auto-publish a caller-supplied `associationRoot`; the ASP good-set must be advanced only by the trusted ASP from its own verified set. Validate every field (hex/length/range) before touching the chain. Bind quote→tx settlement to the actual on-chain commitment. Add auth + rate limiting.

### P1-11 · EVAL_BYPASS removes the KYC gate via env flag with no production assertion
- **Subsystem:** wallet (security/compliance) · **File:** `dfx-wallet/src/features/cloister/PrivatePaymentsScreenImpl.tsx:26,57-58`; `src/features/pay/PayScreenImpl.tsx:29,73`
- **Problem:** `EVAL_BYPASS = process.env.EXPO_PUBLIC_CLOISTER_EVAL === '1'` collapses the level-50 KYC requirement (`verified = EVAL_BYPASS || kycOk`). Expo statically inlines an unset flag to `false` (so a normal prod build is safe via dead-code elimination), but there is NO build-time assertion that it is unset, and a build that sets it ships a no-KYC compliance break. (Reviewers split P0/P1; the missing production guard is a genuine P1.)
- **Fix:** Fail the production build if `EXPO_PUBLIC_CLOISTER_EVAL` is set, or compile the bypass out via a statically-false prod literal so Metro DCE removes it. Enforce in CI that eval builds are testnet-only.

### P1-12 · Indexer-supplied commitments/leafIndex inserted with no on-chain verification
- **Subsystem:** sdk (security) · **File:** `packages/sdk/src/sync.js:6-24`
- **Problem:** `syncFromIndexer` trusts the indexer's commitments and `leafIndex` order; `syncWithFallback` only falls back on timeout/throw, never on silent tampering. A malicious indexer can desync the local tree (every `transact` reverts → liveness DoS) or record wrong leaf indices (unsatisfiable proofs). (Both reviewers demoted to P2: the on-chain `require(oldRoot == laneRoot)` and in-circuit path consistency make this fail-closed, no fund loss — but it is a real robustness/availability gap.)
- **Fix:** After building from the indexer, compare `tree.root()` to the on-chain `laneRoot` and reconcile with chain-scan on mismatch. Validate `leafIndex` values are contiguous from the expected offset; reject gaps/duplicates. Treat the indexer as untrusted.

### P1-13 · Licensing-integrity: contradictory product-code license + missing root LICENSE
- **Subsystem:** docs/licenses · **File:** `docs/LICENSES.md:11-17` vs `README.md:161` vs root `package.json:6` vs `docs/en/llms.txt:19`
- **Problem:** LICENSES.md says "Proprietary © DFX AG", README says "MIT", `package.json` declares `"license": "MIT"`, and there is no root LICENSE file. The machine-readable metadata (MIT) contradicts the proprietary intent; a downstream consumer could fork it as MIT. `LICENSE_AUDIT.md` T4.1 flagged this and it was never closed.
- **Fix:** Pick one posture (MIT vs proprietary-© DFX AG), align README/LICENSES.md/llms.txt/`package.json`, add a real root LICENSE file, close T4.1.

### P1-14 · Stale wallet-integration / security / build-plan docs describe the deleted circom/snarkjs/BabyJubJub design
- **Subsystem:** docs (cleanup) · **Files:** `docs/INTEGRATION_DFX_WALLET.md`, `docs/SECURITY.md` (German), `docs/BUILD_PLAN.md`, `docs/APP_CONCEPT.md`
- **Problem:** Multiple maintained-looking docs describe the pre-rebuild architecture (snarkjs WASM-WebView/rapidsnark prover, BabyJubJub keys, `keypair.circom`, `transaction*.circom`, 78,044 constraints, "compliance does not exist in code"). The as-built system is gnark, curve-free `pubKey=H(privKey)`, 50,481 constraints, ASP circuit-enforced as the 10th public signal. Two contradictory security docs are an audit-confusion hazard. `BUILD_PLAN.md`/`APP_CONCEPT.md` also contain stray `</content>`/`</invoke>` tool-output artifacts.
- **Fix:** Delete or archive these under `docs/de-archive/` with a SUPERSEDED banner pointing at `docs/en/*`; reduce `INTEGRATION_DFX_WALLET.md` to a pointer to `packages/prover-gnark/INTEGRATION.md`; strip the XML artifacts. `docs/en/SECURITY.md` is the single source of truth.

> **Excluded from P1** (adversarial verdict `real:false`): pairIndex-forces-sequential-insertion (contracts) — refuted, serialization is the documented `oldRoot` check, pairIndex is redundant; dummy-input membership skip (circuit) — refuted, standard Tornado-Nova dummy pattern, attacker cannot pin a victim's nullifier without their key; PublicAmount "mint" P0 (circuit) — exploit unreachable (contract computes publicAmount), demoted to a P2 hardening note; relayer single-provider/no-failover "scale" finding — refuted as a testnet-only artifact with an invented SLA; cloister-pay deep-link "attacker config + silent no-PIN deposit" — refuted (config param unused, review screen requires explicit Confirm); PayScreen LAN-fallback "cleartext fetch" — refuted (the `config` param is dead plumbing, never fetched); cloister-tx ledger race — refuted (synchronous single-threaded JS, no async, `add` has zero callers); success-without-confirmation (wallet) — refuted (native `DepositAndSubmit` does `WaitMined` + status==1 check, reverts surface as errors); server.js global-tree/dfxWallet/quotes + dfx.privateKey — refuted/demoted (self-declared localhost mock with ephemeral keys and locally-deployed stack).

---

## 4. P2 / info (brief)

**Contracts:**
- P2 — Single-step Guardian/ASP transfers, no zero-address guard (`ShieldedPool.sol:134-137,262-265`): use Ownable2Step / `require(!= address(0))`; reject zero ASP on a non-zero-ASP pool.
- P2 — `asp == address(0)` silently disables compliance and is the deploy default (`ShieldedPool.sol:185`, `deploy.mjs:35`): require non-zero ASP for mainnet / chain-id gate. (Demoted from P1; field-range half is non-load-bearing since `Groth16Verifier` enforces `< R`.)
- P2 — Constructor inits `laneRoot` in an unbounded loop (`:121`): lazy-init via `r == 0 ? initialRoot : r` getter to decouple deploy cost from `numLanes`.
- P2 — `TransactionVerifier` bare-catch swallows OOG + extra self-call/re-encode on the hot path (`:21-34`): call the reverting view directly or an internal verify; catch specific custom errors.
- P2 — Global `nullifierSpent` mapping grows unboundedly (~2 cold SSTORE/tx) (`:57,215-216`): document state-growth and per-tx gas budget; ensure relayer fee covers it.
- info — extDataHash binding, duplicate-nullifier guard, CEI ordering, publicAmount field-wrap all confirmed correct.

**Circuit:** P2 — tautological `AssertIsEqual(ExtDataHash,ExtDataHash)` is only a wire-anchor (document that extData integrity is in the contract keccak); P2 — `BuildDepositAssignment` defaults `AssociationRoot = pool Root` "dev mode" (add an explicit AssociationRoot/path field, fail closed for non-dev); P2 — nullifier index canonicality relies on tree well-formedness (document the one-leaf-per-index invariant); P2 — value-soundness PublicAmount is delegated to the contract (add in-circuit `ToBinary(PublicAmount ± MAX)` as defense-in-depth). info — zero-commitment empty-leaf aliasing (optionally `require != 0`); >2-input Poseidon2 parity untested (add 1- and 3-input parity tests); deposit RNG `SetRandom` error swallowed (propagate it).

**Prover:** P2 — `cmd/setup` re-derives r1cs/Verifier.sol while reusing pk/vk (persist + assert a circuit hash; note both reviewers demoted to P2 because every prove path self-verifies and fails loudly); P2 — `emitproof` discards `w.Public()` error before verify; info — proof byte-split + 10-signal ordering confirmed correct.

**Relayer/build (testnet artifacts — fix before promoting to prod, P2 as-is):** plaintext key in `.env.testnet` + no KMS; unauthenticated `/v1/deposit/submit` mint + no rate limit; non-atomic in-memory tree + NonceManager race; non-atomic mint→approve→transact recovery; unpaginated `eth_getLogs` from genesis; wildcard CORS + no auth on mutating endpoints (`server.js:64-73`, indexer `:53`); `publicSignals` shape unvalidated; age computed with fixed 365.25-day constant (`kyc.js:89-93`); fresh MockERC20 mint instead of real USDC (`server.js`, `deploy.mjs:41`) — gate behind a local-only chain-id flag and wire canonical USDC for mainnet.

**SDK:** P2 — direct-RPC fallback always calls lane-0 `transact` ignoring `tx.lane` (`submit.js:149-169`); P2 — idempotency silently off when `poolAddress`/`rpcUrls` absent; P2 — `Note` constructor / `tryDecrypt` lack range/sign validation on amount/blinding (`note.js`); P2 — `cryptoShim` randomness has no CSPRNG assertion (demoted to P2: fail-closed when `crypto` absent, no RN app ships in-tree); info — `firstLiveProvider` comment/impl mismatch; viewing-key derivation (sha256 of base-10 ASCII) document for cross-impl; stale circomlibjs comment + dead `SUBGROUP_ORDER`/`toSolidityProof`.

**Wallet:** P2 — stale WebView/relayer comments + dead `hiddenWebview` style (`cloister.tsx`); P2 — `hash()` Swift function skips `ensureInitialized()`; info — prover keys/xcframework correctly gitignored; sample-witness.json with hardcoded private values bundled (move to dev-only).

**Licenses:** P2 — incomplete NOTICE/THIRD_PARTY_LICENSES for the ~25 permissive Go modules (Apache NOTICE + BSD/MIT reproduction obligations); info — gnark/gnark-crypto Apache-2.0 confirmed; ProjectZKM/Ziren unlicensed but NOT linked into the shipped binary (removed entirely once go-ethereum leaves the bind); JS/SDK deps permissive, circom/snarkjs gone.

**Docs:** P2 — `PRODUCTION_READINESS.md` still says BabyJubJub keys; `FALLBACKS.md` says gnark-WASM web backend "on the roadmap" (already built); `LICENSE_AUDIT.md` present-tense asserts already-resolved GPL liabilities (add HISTORICAL banner, note TransactionVerifier is now MIT); German `ARCHITECTURE.md`/`CONCEPT.md`/`BENCHMARK.md` carry superseded primitives (archive). info — contract-test count inconsistent (10 vs 12 vs 13 `it()` blocks — re-run and quote one number); `STRESS_TEST.md`/`MASTER_PLAN.md`/`BB_FINDINGS.md` are internal artifacts (move to `docs/en/internal/`); amount-denomination + min-anonymity-set floor live only in `ANONYMITY_SET.md` (surface in PRIVACY.md/README so the privacy claim is qualified).

**Build:** P2 — soak PROVERD port 8792 vs stack 8799 mismatch; no Base/baseSepolia network or Etherscan-verify config in hardhat (mainnet-readiness); built web app ships gnark artifacts twice (~30MB redundant, nested `gnark/gnark/`); `deployment.basesepolia.json` is a stale tracked duplicate but is actively read by `preshield-testnet.mjs`/`pay-testnet.mjs` — reconcile rather than blindly delete; `.env.testnet` parser is brittle but `.trim()`s both halves so the scary CRLF/`\r` claim is overstated (info — add quote-stripping + key/URL validation). info — `.env.testnet` correctly gitignored; prod web build defaults to mock `demo` backend (no accidental mainnet exposure) but base-sepolia entry points at localhost (no real backend wired yet).

---

## 5. Scale @ 100,000 users/day

100k tx/day ≈ 1.16 tx/s sustained, with bursts well above. Concrete walls (from worst to least):

1. **Per-lane single root (P1-1).** Every same-lane tx invalidates in-flight proofs. With `numLanes=8` (deploy default) and on-device proving as the expensive step, a large fraction of honest proofs revert and must be re-proven. **Needs:** rolling root-history window + a serializing relayer/sequencer that re-targets proofs; raise `numLanes`.
2. **Tree-sync / `eth_getLogs` cost.** Both the relayer (`merkleTree.js` rebuilds layers per `root()/path()/pairPath()` call — multiple full builds per request, each routed hash-by-hash over HTTP to proverd) and the on-device `DepositDirect` (`submit.go` full-genesis scan + recursive `layer()`) recompute O(N) Poseidon per request from scratch, with the SDK relayer also issuing unpaginated `queryFilter`. Public RPCs cap `eth_getLogs` by block range AND result count, so a from-genesis scan is rejected outright. **Needs:** incremental/persisted tree (frontier + cached layers, O(log n) insert), in-process or batched Poseidon (no per-hash HTTP), paginated + persisted chain sync with a dedicated indexer/archive endpoint, and serve constant-size `{root, pairIndex, pairPathEls}` to clients.
3. **Nonce + mempool (P1-6).** Single sender + `PendingNonceAt` on a load-balanced RPC collides nonces; unbounded `WaitMined` hangs on dropped receipts; serial mint→approve→transact confirmations (~3 Base blocks each) cannot sustain 1.16 tx/s through one sender. **Needs:** multiple sender accounts / a managed tx queue with parallel in-flight nonces + gap detection + speed-up (replacement) logic; drop per-deposit mint+approve (pre-approve / permit); sticky RPC or server-side nonce manager; EIP-1559 fee strategy (the on-device path hardcodes `GasLimit=900000` with no fee tuning).
4. **Gas / state growth.** Two cold `nullifierSpent` SSTOREs/tx (~40k+ gas) plus the verifier are the dominant recurring per-tx cost; ~200k new permanent slots/day. **Needs:** size the per-tx gas budget for Base, ensure relayer fee economics cover ~2 cold SSTORE so the pool/relayers are not run at a loss; publish state-growth/node-sync analysis.
5. **Relayer concurrency.** The in-memory shared tree + NonceManager has races under parallel prepares/submits (real even though the current relayer is a testnet faucet). **Needs:** serialize state-mutating ops behind an async queue/mutex; reconcile the tree from confirmed on-chain `NewCommitment` events (idempotent append by leafIndex), never optimistic local inserts that desync on a dropped receipt.

**Verdict:** the system as written cannot serve 100k/day. Closing P1-1, item 2 (incremental tree + paginated/indexed sync), and item 3 (managed nonce/tx pipeline) is mandatory; build a proper indexer + relayer fleet rather than per-client full resyncs.

---

## 6. Performance levers (ranked, fastest wins first)

1. **Serve constant-size membership data from an indexer** instead of per-client tree rebuilds — eliminates the O(N) per-request hashing and the `eth_getLogs` storms in one move (relayer `merkleTree.js`, `submit.go`, `sync.js`).
2. **Incremental/persisted Merkle tree** (filled-subtree frontier + cached layers; O(log n) insert; iterative not recursive `layer()`), persisted across restarts — removes the genesis rescan and the recursive layer recompute.
3. **In-process / batched Poseidon** — drop the per-hash HTTP round-trip to proverd in the relayer; batch hashing.
4. **Per-lane root-history window + more lanes** — turns reverting concurrent proofs into accepted ones, recovering wasted on-device proving (the most expensive resource).
5. **Managed nonce/tx pipeline with parallel senders + EIP-1559 fees + gas estimation** — raises submit throughput far above one serial sender and stops fee-spike stalls.
6. **Pre-approve / permit** instead of per-deposit mint+approve — removes 2 of 3 serial confirmations per deposit.
7. **Lazy `laneRoot` init** + remove the verifier adapter self-call/re-encode — cheaper deploys and a slightly cheaper hot path.
8. **De-duplicate the shipped gnark artifacts** (nested `gnark/gnark/`) — halves the ~30MB prover download per web visitor.

(Measured baseline: gnark ~190-220ms desktop / ~366-438ms iPhone, 50,481 constraints — the prover itself is fast; the bottlenecks are sync/throughput, not proving.)

---

## 7. License posture

**Headline problem:** go-ethereum v1.17.3 (LGPL-3.0 library tree) is statically linked into the shipped, proprietary-declared `Cloister.xcframework` (P0-2), while `docs/LICENSES.md` and `README.md` declare the stack GPL/copyleft-free. This is a live, distributed LGPL violation and a materially false IP representation.

**Problematic packages / status:**
- `github.com/ethereum/go-ethereum` v1.17.3 — **LGPL-3.0**, statically linked into the iOS framework via `onchain/submit.go` (imports `ethclient`, `accounts/abi`, `accounts/abi/bind`, `common`, `core/types`, `crypto`). **Must be removed from the bind.**
- `github.com/ProjectZKM/Ziren/.../zkvm_runtime` — **no LICENSE file (unknown)**, pulled transitively via `go-ethereum/crypto`; not currently in the shipped binary, removed entirely once geth leaves the bind.
- gnark v0.15.0 / gnark-crypto v0.20.1 / blst / intcomp — **Apache-2.0** (NOTICE/attribution obligation); golang.org/x/*, uint256, gopsutil, bitset — **BSD**; cbor, golang-set, zerolog — **MIT**. All permissive; need a bundled NOTICE / THIRD_PARTY_LICENSES.
- `Groth16Verifier.sol` (Remco Bloemen / gnark template) + `TransactionVerifier.sol` — **MIT**, Apache-compatible. Clean.
- JS/SDK (`ethers`, `express` MIT; `tweetnacl` Unlicense; etc.) — permissive; no circom/snarkjs/circomlib remain.

**Recommended resolution:**
1. **Move on-chain submission off the gomobile surface entirely.** The native prover needs only gnark/gnark-crypto (Apache-2.0) to produce a proof. Have the wallet broadcast `transact()`/deposit via the existing TS + ethers (MIT) path using a **WDK-managed key** (which also fixes P0-3's shared-key problem). The xcframework then links only Apache/BSD/MIT — no LGPL, no unknown-license edge.
2. **Regenerate `LICENSES.md` mechanically** from `go list -deps ./mobile` + `pnpm licenses list`; correct the "GPL-free by design" claims; resolve the MIT-vs-Proprietary contradiction and add a root LICENSE (P1-13).
3. **Ship a NOTICE / THIRD_PARTY_LICENSES** bundling license text + copyright for every linked Go module and npm package (Apache NOTICE + BSD/MIT reproduction). Add a `pnpm licenses`/`go-licenses` CI gate to prevent regression.

(If go-ethereum must stay in a shipped binary, it cannot be shipped as Proprietary: you would need dynamic linking or relinkable objects + LGPL text + written offer + DFX legal sign-off. Removing the import is the correct fix.)

---

## 8. Cleanup actions

**Stale docs (per file):**
- `docs/INTEGRATION_DFX_WALLET.md` — **delete / replace** with a one-line pointer to `packages/prover-gnark/INTEGRATION.md`; or archive with SUPERSEDED banner.
- `docs/SECURITY.md` (German) — **delete / archive** to `docs/de-archive/` with banner pointing at `docs/en/SECURITY.md` (two contradictory security docs = audit hazard).
- `docs/BUILD_PLAN.md` — **delete / archive**; strip trailing `</content>` artifact (line 80).
- `docs/APP_CONCEPT.md` — **update** line 82 to gnark-WASM backend + correct the figure, or archive; strip `</content></invoke>` (lines 95-96).
- `docs/ARCHITECTURE.md`, `docs/CONCEPT.md`, `docs/BENCHMARK.md` (German) — **archive** to `docs/de-archive/` with SUPERSEDED banner; `docs/en/*` is the single source of truth. Fix BENCHMARK "56,700 constraints" → 50,481 and drop "circuits do not exist yet".
- `docs/PRODUCTION_READINESS.md` — **keep**; update lines 31-33 to curve-free `pubKey=H(privKey)`.
- `docs/FALLBACKS.md` — **keep**; update lines 12-13 (gnark-WASM web backend is built, not "on the roadmap").
- `docs/LICENSE_AUDIT.md` — **keep as history**; add HISTORICAL banner, note TransactionVerifier is now MIT.
- `docs/en/STRESS_TEST.md`, `MASTER_PLAN.md`, `BB_FINDINGS.md` — **move** to `docs/en/internal/`; keep BB F1-F5 findings, trim Big-Brother/token operational narrative.
- `docs/en/concepts/ANONYMITY_SET.md` — **keep**; surface the amount-denomination + min-anonymity-set floor in PRIVACY.md and the README privacy claim.

**Dead code / artifacts:**
- Remove dead `hiddenWebview` style + stale WebView/relayer comments in `dfx-wallet/app/(auth)/pay/cloister.tsx`.
- Mark `SUBGROUP_ORDER`/`toSolidityProof` (sdk) and the circomlibjs `buffer-inject` comment as deprecated/dead.
- Regenerate or gitignore the stale `packages/prover-gnark/build/Verifier.sol` (no longer matches `keys/vk.bin`; misled a reviewer into a false P0).
- Fix the build/copy step duplicating gnark artifacts (`deploy/app/gnark/gnark/`).
- Reconcile `deployment.basesepolia.json` (don't blind-delete; it's read by `preshield-testnet.mjs`/`pay-testnet.mjs`).
- Move `sample-witness.json` + the self-test out of the shipped `src` tree.

**Demo / eval / sideload flags (must be provably off in production):**
- `EXPO_PUBLIC_CLOISTER_KEY` / `EXPO_PUBLIC_CLOISTER_OWNER` (P0-3) — remove the path; fail prod build if present.
- `index.tsx` auto-auth (P0-4) — gate behind a sideload-only flag, assert unset in release.
- `EXPO_PUBLIC_CLOISTER_EVAL` (P1-11) — fail prod build if set / DCE-remove.
- `server.js` MockERC20 mint + `asp == address(0)` permissive default — gate behind a local-only chain-id flag; never on mainnet.

**Branches:** the work lives on `feat/cloister-shielded-pay` (wallet) — keep gating-flags off when merging to `develop`; do not promote any testnet faucet relayer config to a production deploy.

---

## 9. Recommended fix order (sequenced checklist to mainnet)

**Phase A — Stop-the-bleed safety (gating, do first):**
1. [ ] Remove the embedded deployer-key path; sign deposits with WDK-managed key; derive note-owner key per-user from seed (P0-3). Rotate/sweep the leaked testnet key.
2. [ ] Move on-chain submit off the gomobile bind to TS+ethers+WDK; drop go-ethereum from `./mobile` (P0-2 + P1-7 + LGPL). Verify `go list -deps ./mobile` is Apache/BSD/MIT-only.
3. [ ] Gate `index.tsx` auto-auth and `EXPO_PUBLIC_CLOISTER_EVAL` behind sideload/eval-only flags with build-time assertions they are unset in release (P0-4, P1-11).
4. [ ] Add `require(_levels == 20)` + VK-depth assertion to the pool constructor (P1-3); require non-zero ASP for mainnet (asp-default P2).

**Phase B — Trust root + containment:**
5. [ ] Run a verifiable multi-party Phase-2 ceremony; publish transcript + deterministic verify script; re-export `Groth16Verifier.sol`; CI guard against the dev vk hash (P0-1).
6. [ ] Add a time-boxed multisig circuit-breaker + per-tx/per-block withdrawal caps (P1-2). Commission an independent circuit + verifier audit.

**Phase C — Compliance + correctness:**
7. [ ] Integrate licensed sanctions screening (OFAC SDN + EU, fuzzy/alias) — no "verified" off the sample list (P1-9).
8. [ ] Never auto-publish caller-supplied ASP roots; validate all `/v1/shielded/submit` inputs; bind quote→commitment; add auth + rate limits (P1-10).
9. [ ] Make `syncTree` lane-aware (P1-4); assert even leaf count in `buildWitness` (P1-8); verify indexer results against on-chain `laneRoot` (P1-12).
10. [ ] Add field-range / amount validation in Note/tryDecrypt; PublicAmount in-circuit range as defense-in-depth (P2s).

**Phase D — Scale + real-asset wiring:**
11. [ ] Build a real indexer; serve constant-size membership data; incremental/persisted Merkle tree; in-process/batched Poseidon; paginated chain sync (P1-5, scale items 1-2).
12. [ ] Add per-lane root-history window + raise `numLanes`; relayer/sequencer that re-targets proofs (P1-1).
13. [ ] Managed nonce/tx pipeline (parallel senders, gap detection, speed-up), bounded `WaitMined`, EIP-1559 fees, gas estimation (P1-6, scale item 3); KMS/HSM signer; serialize relayer state mutations; reconcile tree from confirmed events.
14. [ ] Wire canonical USDC; remove all mint/MockERC20 paths from anything that can reach a non-local chain.

**Phase E — Licensing + docs + hardening:**
15. [ ] Resolve license posture + root LICENSE (P1-13); regenerate LICENSES.md mechanically; ship NOTICE/THIRD_PARTY_LICENSES; add license CI gate.
16. [ ] Archive/merge stale docs (§8); add hardhat Base networks + Etherscan verify; fix the duplicate gnark artifact build step; close remaining P2s.

Mainnet GO is contingent on Phases A-D complete and the independent audit (step 6) clean.
