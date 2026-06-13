# Cloister — Fallbacks & resilience

Design goal: **a payment must never hang and never double-submit**, on any network
(VPN, cellular, foreign WiFi, flaky relayer). Two independent fallback chains plus
idempotency make the flow robust.

## 1. Proving

- **Production (wallet)**: on-device native module (`cloister-prover`). Always present in a
  proper dev/release build; the witness stays on device.
- **Dev / CI / Node**: `proverd` HTTP backend.
- **Web (`apps/web`)**: a gnark-WASM backend is on the roadmap for the browser context;
  the prover library already supports in-memory key loading (`prover.LoadFrom`) to enable it.
- The SDK selects the backend via `setHashBackend` / `setProveBackend`; the wallet wires the
  native module once (`wireCloisterNativeBackend`). If the native module is unavailable the
  SDK throws a **clear, actionable error** rather than silently degrading.

## 2. Submission (`submitShielded`, `packages/sdk/src/submit.js`)

Order of operations, all timeout-bounded by `perCallMs` and an overall `deadlineMs`:

0. **Idempotency precheck** — query `nullifierSpent(nf0)` on chain via the first live RPC.
   If already spent, this exact tx landed (the nullifier is unique to this note+spend) →
   return `already-onchain`. This is the anti-double-submit guarantee that makes every
   retry below safe.
1. **Relayer endpoints** (privacy-preserving) — tried in order, `maxRounds` times, with
   exponential backoff (0.5s → 1s → 2s …). After any relayer error, re-run the idempotency
   check (the tx may have landed despite a lost response).
2. **Direct-RPC fallback** (opt-in, `allowDirect`) — the user submits over the first live
   RPC. Guarantees liveness when every relayer is down, at the cost of revealing the
   sender. **Off by default.**

If everything fails within the deadline, it throws — never hangs — so the UI watchdog
always resolves.

## 3. Tree sync (`syncWithFallback`, `packages/sdk/src/sync.js`)

- Prefer the **indexer** (fast, view-tag filtered), each URL timeout-bounded.
- On failure, **direct on-chain scan** of `NewCommitment` events via the pool contract.
- Throws only if every indexer is down *and* no pool was provided.

## 4. UI watchdogs (wallet pay screen)

The pay screen keeps independent watchdog timers: a prepare window, a prover-ready window,
and an overall pay window. Any stall trips a clear, retryable error. A late timer can never
override a settled (paid/failed/cancelled) outcome.

## Why this satisfies "can't pay on VPN"

Proving is local (no network needed). The only network step is submission, which has
multiple relayers, an opt-in direct path, retries with backoff, and idempotency — so a
single dead endpoint, a captive VPN, or a lost response cannot strand or duplicate a
payment.
