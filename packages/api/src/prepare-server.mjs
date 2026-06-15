// Copyright (c) 2026 DFX AG. All rights reserved. Proprietary and confidential.
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
const laneRoot0 = async () => (await poolRead.laneRoot(0)).toString();

// Build the lane-0 tree from chain, trying each RPC's eth_getLogs until the rebuilt
// root matches the on-chain laneRoot (guards against RPC lag / partial results).
async function syncMemTree() {
  const target = await laneRoot0();
  for (const r of RPCS) {
    try {
      const pr = new Contract(dep.pool, POOL_ABI, new JsonRpcProvider(r));
      const tree = await new MerkleTree().init();
      await syncFromChain(pr, tree, [], FROM_BLOCK);
      if ((await tree.root()).toString() === target) {
        console.log(`tree synced via ${r}: ${tree.leaves.length} leaves`);
        memTree = tree;
        return;
      }
      console.log(`sync via ${r}: root mismatch (rpc lag), trying next`);
    } catch (e) {
      console.log(`sync via ${r} failed: ${e.shortMessage || e.message}`);
    }
  }
  throw new Error("could not sync tree from any RPC");
}

const app = express();

app.get("/config", (_req, res) => {
  res.json({ chainId: dep.chainId, pool: dep.pool, token: dep.token, prepare: "/v1/deposit/prepare" });
});

app.get("/v1/deposit/prepare", async (req, res) => {
  try {
    const amount = BigInt(req.query.amount || "0");
    if (amount <= 0n) return res.status(400).json({ error: "amount required" });
    if (!memTree) await syncMemTree();
    // self-validate against chain; on drift (a new deposit landed), re-sync once
    if ((await memTree.root()).toString() !== (await laneRoot0())) await syncMemTree();
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
