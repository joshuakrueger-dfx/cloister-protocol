// State-of-the-art submission layer for shielded transactions.
//
// A payment must NEVER hang and must NEVER double-submit (which could burn the user's
// note for nothing). The strategy, in order:
//
//   0. Idempotency precheck — if the input nullifier is ALREADY spent on-chain, this
//      exact tx already landed (the nullifier is unique to this note+spend). Return
//      success instead of resubmitting. This is the anti-double-submit guarantee and
//      makes every retry below safe.
//   1. Relayer endpoints (privacy-preserving: relayer pays gas, hides the sender).
//      Tried in order, each with a timeout, with exponential backoff.
//   2. Optional direct-RPC fallback (opt-in) — the user submits the tx themselves over
//      any of several RPC endpoints. Guarantees liveness on ANY network (VPN/cellular/
//      foreign WiFi) when every relayer is unreachable. NOTE: this reveals the user's
//      address as the tx sender (privacy trade-off), so it is OFF by default.
//
// All network calls are bounded by timeouts and an overall deadline, so the caller's
// UI watchdog can rely on this resolving or throwing — never hanging.

import { Contract, JsonRpcProvider, Wallet } from "ethers";

const POOL_ABI = [
  "function nullifierSpent(uint256) view returns (bool)",
  "function laneRoot(uint256) view returns (uint256)",
  "function transact((uint256[2] a,uint256[2][2] b,uint256[2] c) proof,uint256 oldRoot,uint256 newRoot,uint256 associationRoot,uint256[2] inputNullifiers,uint256[2] outputCommitments,(address recipient,int256 extAmount,address relayer,uint256 fee,bytes encryptedOutput1,bytes encryptedOutput2) extData)",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function withTimeout(promise, ms, label) {
  let t;
  const timeout = new Promise((_, rej) => {
    t = setTimeout(() => rej(new Error(`timeout: ${label} (${ms}ms)`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}

function extTuple(e) {
  return [e.recipient, e.extAmount, e.relayer, e.fee, e.encryptedOutput1, e.encryptedOutput2];
}

// Build the relayer payload from a buildTransaction() result.
function relayerPayload(tx) {
  return {
    proof: tx.proof,
    root: tx.root,
    newRoot: tx.newRoot,
    associationRoot: tx.associationRoot,
    inputNullifiers: tx.inputNullifiers,
    outputCommitments: tx.outputCommitments,
    extData: tx.extData,
    lane: tx.lane ?? 0,
  };
}

// Returns the first provider whose nullifierSpent call succeeds (a liveness probe).
async function firstLiveProvider(rpcUrls, perCallMs) {
  for (const url of rpcUrls) {
    try {
      const p = new JsonRpcProvider(url);
      await withTimeout(p.getBlockNumber(), perCallMs, `rpc ${url}`);
      return p;
    } catch {
      /* try next */
    }
  }
  return null;
}

/**
 * Submit a shielded transaction with full fallback + idempotency.
 *
 * @param {object} tx           result of buildTransaction()
 * @param {object} opts
 *   relayerUrls   string[]     relayer base URLs (POST {base}/v1/shielded/submit)
 *   rpcUrls       string[]     RPC endpoints for the idempotency check + direct fallback
 *   poolAddress   string       shielded pool address (for the nullifier check / direct submit)
 *   allowDirect   boolean      enable direct-RPC fallback (default false; leaks sender)
 *   directKey     string       private key for the direct fallback (required if allowDirect)
 *   perCallMs     number       per-attempt timeout (default 12000)
 *   deadlineMs    number       overall deadline (default 90000)
 *   maxRounds     number       relayer retry rounds (default 3)
 *   fetchImpl     function     fetch (default globalThis.fetch)
 * @returns {Promise<{status, txHash?, via}>}
 */
export async function submitShielded(tx, opts = {}) {
  const {
    relayerUrls = [],
    rpcUrls = [],
    poolAddress,
    allowDirect = false,
    directKey,
    perCallMs = 12_000,
    deadlineMs = 90_000,
    maxRounds = 3,
    fetchImpl = globalThis.fetch,
  } = opts;

  const started = Date.now();
  const overBudget = () => Date.now() - started > deadlineMs;
  const nf0 = tx.inputNullifiers?.[0];

  // helper: is this tx already on-chain? (idempotency)
  async function alreadyLanded() {
    if (!poolAddress || !rpcUrls.length || nf0 == null) return false;
    const provider = await firstLiveProvider(rpcUrls, perCallMs);
    if (!provider) return false;
    const pool = new Contract(poolAddress, POOL_ABI, provider);
    try {
      return await withTimeout(pool.nullifierSpent(nf0), perCallMs, "nullifierSpent");
    } catch {
      return false;
    }
  }

  // helper: was this proof built against a STALE on-chain root? (fail-fast)
  // The contract requires oldRoot == laneRoot[lane]; a mismatch means our local tree
  // drifted from chain (sync gap / lost race), so the tx is doomed and would burn a
  // relay attempt + an opaque on-chain revert. Detect it up front. Only checked when we
  // can read chain (rpcUrls + poolAddress); otherwise the on-chain require stays the backstop.
  async function staleRoot() {
    if (!poolAddress || !rpcUrls.length || tx.root == null) return false;
    const provider = await firstLiveProvider(rpcUrls, perCallMs);
    if (!provider) return false;
    const pool = new Contract(poolAddress, POOL_ABI, provider);
    try {
      const onchain = await withTimeout(pool.laneRoot(tx.lane ?? 0), perCallMs, "laneRoot");
      return BigInt(onchain) !== BigInt(tx.root);
    } catch {
      return false; // can't read → don't block; the contract require is the backstop
    }
  }

  // 0. idempotency precheck
  if (await alreadyLanded()) return { status: "already-onchain", via: "idempotency" };

  // 0b. fail-fast root check — refuse to broadcast a proof bound to a stale root (#1).
  // (Idempotency is checked first: if the tx already landed, laneRoot has moved past
  // tx.root, which is success, not a stale-root error.)
  if (await staleRoot()) {
    throw new Error("stale root: proof oldRoot != on-chain laneRoot — resync the tree and rebuild before submitting");
  }

  // 1. relayer rounds with exponential backoff
  let lastErr;
  for (let round = 0; round < maxRounds; round++) {
    for (const base of relayerUrls) {
      if (overBudget()) break;
      try {
        const res = await withTimeout(
          fetchImpl(`${base.replace(/\/$/, "")}/v1/shielded/submit`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(relayerPayload(tx)),
          }),
          perCallMs,
          `relayer ${base}`,
        );
        if (res.ok) {
          const body = await res.json().catch(() => ({}));
          return { status: "broadcast", txHash: body.txHash, via: `relayer:${base}` };
        }
        lastErr = new Error(`relayer ${base} HTTP ${res.status}`);
      } catch (e) {
        lastErr = e;
      }
      // a relayer error might still have landed the tx (lost response) → recheck
      if (await alreadyLanded()) return { status: "already-onchain", via: "idempotency" };
    }
    if (overBudget()) break;
    await sleep(Math.min(2 ** round * 500, 4000)); // 0.5s, 1s, 2s…
  }

  // 2. opt-in direct-RPC fallback (liveness over privacy)
  if (allowDirect && directKey && poolAddress && !overBudget()) {
    const provider = await firstLiveProvider(rpcUrls, perCallMs);
    if (provider) {
      if (await alreadyLanded()) return { status: "already-onchain", via: "idempotency" };
      const wallet = new Wallet(directKey, provider);
      const pool = new Contract(poolAddress, POOL_ABI, wallet);
      const sent = await withTimeout(
        pool.transact(
          [tx.proof.a, tx.proof.b, tx.proof.c],
          tx.root,
          tx.newRoot,
          tx.associationRoot,
          tx.inputNullifiers,
          tx.outputCommitments,
          extTuple(tx.extData),
        ),
        perCallMs,
        "direct transact",
      );
      const rc = await withTimeout(sent.wait(), perCallMs, "direct wait");
      return { status: "broadcast", txHash: rc.hash, via: "direct-rpc" };
    }
  }

  throw new Error(`submit failed: every relayer unreachable${allowDirect ? " and direct fallback failed" : ""} — last: ${lastErr?.message || "n/a"}`);
}
