// Copyright (c) 2026 DFX AG. Licensed under the MIT License (see LICENSE).
//
// Key-less Cloister deposit "prepare" service. It serves the Merkle-tree insertion
// context the on-device prover needs (root, pairIndex, pairPathEls, extData,
// extDataHash) — READ-ONLY: it holds no private key and broadcasts nothing. The
// user's own wallet signs + broadcasts the deposit tx. This is the production-shaped
// replacement for the on-device go-ethereum tree-sync (removes that LGPL dependency
// from the shipped binary and the per-client from-genesis getLogs scan).
//
//   GET /config                       → { chainId, pool, token, prepare }
//   GET /v1/deposit/prepare?amount=X   → { root, pairIndex, pairPathEls[], extData, extDataHash }
//
// Run: PROVERD_URL=http://127.0.0.1:8799 FROM_BLOCK=<deployBlock> PORT=8790 \
//      node src/prepare-server.mjs            (binds 0.0.0.0 so a device can reach it)
import express from "express";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { JsonRpcProvider, Contract, ZeroAddress } from "ethers";
import { MerkleTree, syncFromChain, encodeExtData, useHttpBackend } from "@cloister/sdk";

// Minimal read-only ABI — /prepare only needs the current lane root and the
// NewCommitment event stream to rebuild the tree. (Inlined so this server is
// self-contained / bundleable; it never needs the full contracts package.)
const POOL_ABI = [
  "function laneRoot(uint256) view returns (uint256)",
  "event NewCommitment(uint256 indexed commitment, uint32 leafIndex, bytes encryptedOutput)",
];

// Deployment descriptor: explicit DEPLOYMENT_FILE (set on the mini) or the repo file.
const __dirname = dirname(fileURLToPath(import.meta.url));
const depPath =
  process.env.DEPLOYMENT_FILE ||
  resolve(__dirname, "..", "..", "..", `deployment.${process.env.CHAIN_ID || "84532"}.json`);
const dep = JSON.parse(readFileSync(depPath, "utf8"));

const RPC = process.env.RPC || "https://base-sepolia-rpc.publicnode.com";
const PROVERD = process.env.PROVERD_URL || "http://127.0.0.1:8799";
const PORT = Number(process.env.PORT || 8790);
const HOST = process.env.HOST || "0.0.0.0";
const FROM_BLOCK = Number(process.env.FROM_BLOCK || 0);
// eth_getLogs failover — public RPCs cap range/result count, so we try several.
const RPCS = [RPC, "https://base-sepolia.gateway.tenderly.co", "https://base-sepolia-rpc.publicnode.com", "https://base-sepolia.drpc.org"]
  .filter((v, i, a) => v && a.indexOf(v) === i);

useHttpBackend(PROVERD); // Poseidon2 for tree root + pair path

const provider = new JsonRpcProvider(RPC);
const poolRead = new Contract(dep.pool, POOL_ABI, provider);

const depositExtData = (amount) => ({ recipient: ZeroAddress, extAmount: String(amount), relayer: ZeroAddress, fee: "0", encryptedOutput1: "0x", encryptedOutput2: "0x" });

let memTree;
// Short-TTL cache of the on-chain lane root, so a burst of /prepare calls doesn't hammer the
// RPC with one laneRoot(0) read each. 2s ≈ the Base block time, so drift is still caught promptly.
const ROOT_TTL_MS = 2000;
let rootCache = { val: null, at: 0 };
async function laneRoot0(force = false) {
  const now = Date.now();
  if (!force && rootCache.val && now - rootCache.at < ROOT_TTL_MS) return rootCache.val;
  const v = (await poolRead.laneRoot(0)).toString();
  rootCache = { val: v, at: Date.now() };
  return v;
}

// Single-flight: concurrent requests that both observe a stale/absent tree share ONE sync
// instead of each launching a full from-genesis getLogs scan (which would race `memTree` and
// pin the CPU). The first caller does the work; the rest await the same promise.
let syncInFlight = null;
function ensureSync() {
  if (!syncInFlight) syncInFlight = syncMemTree().finally(() => { syncInFlight = null; });
  return syncInFlight;
}

// Build the lane-0 tree from chain, trying each RPC's eth_getLogs until the rebuilt root matches
// THAT SAME RPC's laneRoot (block-consistency: target root and the log scan come from one
// endpoint, so a reorg/lag on a different endpoint can't produce a false match).
async function syncMemTree() {
  for (const r of RPCS) {
    try {
      const pr = new Contract(dep.pool, POOL_ABI, new JsonRpcProvider(r));
      const target = (await pr.laneRoot(0)).toString(); // same endpoint as the logs below
      const tree = await new MerkleTree().init();
      await syncFromChain(pr, tree, [], FROM_BLOCK);
      if ((await tree.root()).toString() === target) {
        console.log(`tree synced via ${r}: ${tree.leaves.length} leaves`);
        memTree = tree;
        rootCache = { val: target, at: Date.now() };
        return;
      }
      console.log(`sync via ${r}: root mismatch (rpc lag), trying next`);
    } catch (e) {
      console.log(`sync via ${r} failed: ${e.shortMessage || e.message}`);
    }
  }
  throw new Error("could not sync tree from any RPC");
}

// Inline fixed-window rate limit (no dependency) — caps full-sync amplification + abuse.
const RATE_WINDOW_MS = 10_000;
const RATE_MAX = 30; // per client per window
const rateHits = new Map();
function rateLimited(key) {
  const now = Date.now();
  const e = rateHits.get(key);
  if (!e || now > e.resetAt) { rateHits.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS }); return false; }
  e.count += 1;
  return e.count > RATE_MAX;
}
// bound the map so a churn of client IPs can't grow it without limit
setInterval(() => { const now = Date.now(); for (const [k, e] of rateHits) if (now > e.resetAt) rateHits.delete(k); }, RATE_WINDOW_MS).unref?.();

const app = express();

app.get("/config", (_req, res) => {
  res.json({ chainId: dep.chainId, pool: dep.pool, token: dep.token, prepare: "/v1/deposit/prepare" });
});

app.get("/v1/deposit/prepare", async (req, res) => {
  try {
    if (rateLimited(req.ip || "global")) return res.status(429).json({ error: "rate limited" });
    let amount;
    try {
      amount = BigInt(req.query.amount ?? "");
    } catch {
      return res.status(400).json({ error: "amount must be a positive integer" });
    }
    if (amount <= 0n) return res.status(400).json({ error: "amount required" });
    if (!memTree) await ensureSync();
    // self-validate against chain; on drift (a new deposit landed), re-sync once (single-flight)
    if ((await memTree.root()).toString() !== (await laneRoot0())) await ensureSync();
    const rootVal = (await memTree.root()).toString();
    const pairIndex = Math.floor(memTree.leaves.length / 2);
    const { pathElements } = await memTree.pairPath(pairIndex);
    const ext = depositExtData(amount.toString());
    res.json({
      root: rootVal,
      pairIndex,
      pairPathEls: pathElements.map((x) => x.toString()),
      extData: ext,
      extDataHash: encodeExtData(ext).toString(),
    });
  } catch (e) {
    res.status(503).json({ error: e.shortMessage || e.message });
  }
});

app.listen(PORT, HOST, () => console.log(`cloister prepare-server on ${HOST}:${PORT} (pool ${dep.pool}, proverd ${PROVERD})`));
