import express from "express";
import fs from "node:fs";
import { JsonRpcProvider, Contract } from "ethers";
import { loadAbi } from "@cloister/contracts/deploy";
import { Note } from "@cloister/sdk";

const RPC = process.env.RPC || "http://127.0.0.1:8545";
const PORT = Number(process.env.PORT || 8789);
const API = process.env.API || "http://127.0.0.1:8788";
const POOL_ENV = process.env.POOL;
const STATE_FILE = process.env.INDEXER_STATE || "/tmp/cloister-indexer-state.json";
const START_BLOCK = Number(process.env.INDEXER_START_BLOCK || 0);
const BATCH_BLOCKS = Math.max(1, Number(process.env.INDEXER_BATCH_BLOCKS || 2_000));
const CONFIRMATIONS = Math.max(0, Number(process.env.INDEXER_CONFIRMATIONS || 0));

async function resolvePool() {
  if (POOL_ENV) return POOL_ENV;
  const cfg = await (await fetch(`${API}/config`)).json();
  return cfg.pool;
}

async function main() {
  const provider = new JsonRpcProvider(RPC);
  const poolAddr = await resolvePool();
  const chainId = Number((await provider.getNetwork()).chainId);
  const pool = new Contract(poolAddr, loadAbi("ShieldedPool", "ShieldedPool"), provider);

  const commitments = []; // { leafIndex, commitment, encryptedOutput, viewTag, block }
  const spentNullifiers = new Set();
  const seen = new Set();
  const seenNullifierLogs = new Set();
  let fromBlock = START_BLOCK;
  let lastBlockHash = null;

  try {
    const state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
    if (state?.version === 1 && state.pool === poolAddr && Number(state.chainId) === chainId &&
        Array.isArray(state.commitments) && Array.isArray(state.spentNullifiers)) {
      commitments.push(...state.commitments);
      for (const c of commitments) seen.add(Number(c.leafIndex));
      for (const n of state.spentNullifiers) spentNullifiers.add(String(n));
      fromBlock = Math.max(START_BLOCK, Number(state.fromBlock) || START_BLOCK);
      lastBlockHash = typeof state.lastBlockHash === "string" ? state.lastBlockHash : null;
    }
  } catch { /* first start or an interrupted state write */ }

  function saveState() {
    const tmp = `${STATE_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({
      version: 1,
      chainId,
      pool: poolAddr,
      fromBlock,
      lastBlockHash,
      commitments,
      spentNullifiers: [...spentNullifiers],
    }));
    fs.renameSync(tmp, STATE_FILE);
  }

  let activePoll = null;
  async function poll() {
    if (activePoll) return activePoll;
    activePoll = (async () => {
    const latest = await provider.getBlockNumber();
    if (fromBlock > START_BLOCK && lastBlockHash) {
      const previous = await provider.getBlock(fromBlock - 1);
      if (!previous || previous.hash !== lastBlockHash) {
        // Reorg: discard the derived view and replay from the configured deployment block.
        commitments.length = 0;
        spentNullifiers.clear();
        seen.clear();
        seenNullifierLogs.clear();
        fromBlock = START_BLOCK;
        lastBlockHash = null;
        saveState();
      }
    }
    const target = latest - CONFIRMATIONS;
    if (target < fromBlock) return;
    const startBlock = fromBlock;
    const endBlock = Math.min(target, startBlock + BATCH_BLOCKS - 1);
    const logs = await pool.queryFilter(pool.filters.NewCommitment(), startBlock, endBlock);
    for (const l of logs) {
      const leafIndex = Number(l.args[1]);
      if (seen.has(leafIndex)) continue;
      seen.add(leafIndex);
      const enc = l.args[2];
      const hasEnc = enc && enc !== "0x";
      commitments.push({
        leafIndex,
        commitment: l.args[0].toString(),
        encryptedOutput: enc,
        viewTag: hasEnc ? Note.viewTagOf(enc) : null,
        block: l.blockNumber,
      });
    }
    commitments.sort((a, b) => a.leafIndex - b.leafIndex);
    const nullifierLogs = await pool.queryFilter(pool.filters.NewNullifier(), startBlock, endBlock);
    for (const l of nullifierLogs) {
      const key = `${l.blockNumber}:${l.transactionHash}:${l.index ?? l.logIndex ?? l.args[0].toString()}`;
      if (seenNullifierLogs.has(key)) continue;
      seenNullifierLogs.add(key);
      spentNullifiers.add(l.args[0].toString());
    }
    fromBlock = endBlock + 1;
    lastBlockHash = (await provider.getBlock(endBlock))?.hash || null;
    saveState();
    })();
    try { return await activePoll; } finally { activePoll = null; }
  }

  await poll();
  setInterval(() => poll().catch(() => {}), 1000);

  const app = express();
  const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS || "").split(",").map((x) => x.trim()).filter(Boolean));
  app.use((req, res, next) => {
    const origin = req.get("origin");
    if (allowedOrigins.size) {
      if (origin && allowedOrigins.has(origin)) res.header("Access-Control-Allow-Origin", origin);
      res.header("Vary", "Origin");
    } else {
      res.header("Access-Control-Allow-Origin", "*");
    }
    res.header("Access-Control-Allow-Headers", "content-type");
    res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });
  const hits = new Map();
  app.use((req, res, next) => {
    const minute = Math.floor(Date.now() / 60_000);
    const key = `${req.ip || "unknown"}:${minute}`;
    const count = (hits.get(key) || 0) + 1;
    hits.set(key, count);
    if (count > 120) return res.status(429).json({ error: "rate limited" });
    for (const k of hits.keys()) if (!k.endsWith(`:${minute}`)) hits.delete(k);
    next();
  });

  app.get("/health", (_req, res) => res.json({ ok: true, chainId, pool: poolAddr, count: commitments.length, fromBlock, confirmations: CONFIRMATIONS }));

  // Commitments ab Leaf-Index `from` (für Tree-Sync + Tag-Filter clientseitig).
  app.get("/commitments", async (req, res) => {
    await poll().catch(() => {});
    const from = Number(req.query.from || 0);
    const tag = req.query.tag !== undefined ? Number(req.query.tag) : null;
    let out = commitments.filter((c) => c.leafIndex >= from);
    if (tag !== null) out = out.filter((c) => c.viewTag === tag || c.viewTag === null);
    res.json({ total: commitments.length, commitments: out });
  });

  // Bounded nullifier reconciliation endpoint. It lets a recovered wallet establish spent
  // state from canonical chain events instead of trusting localStorage.
  app.get("/nullifiers", async (req, res) => {
    await poll().catch(() => {});
    const raw = String(req.query.ids || "");
    const ids = raw.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 256);
    res.json({ spent: ids.filter((id) => spentNullifiers.has(id)) });
  });

  app.listen(PORT, () => {
    console.log(`Cloister indexer on http://127.0.0.1:${PORT} (pool=${poolAddr})`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
