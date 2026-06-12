import express from "express";
import { JsonRpcProvider, Contract } from "ethers";
import { loadAbi } from "@ocp-shield/contracts/deploy";
import { Note } from "@ocp-shield/sdk";

const RPC = process.env.RPC || "http://127.0.0.1:8545";
const PORT = Number(process.env.PORT || 8789);
const API = process.env.API || "http://127.0.0.1:8788";
const POOL_ENV = process.env.POOL;

async function resolvePool() {
  if (POOL_ENV) return POOL_ENV;
  const cfg = await (await fetch(`${API}/config`)).json();
  return cfg.pool;
}

async function main() {
  const provider = new JsonRpcProvider(RPC);
  const poolAddr = await resolvePool();
  const pool = new Contract(poolAddr, loadAbi("ShieldedPool", "ShieldedPool"), provider);

  const commitments = []; // { leafIndex, commitment, encryptedOutput, viewTag, block }
  const seen = new Set();
  let fromBlock = 0;

  async function poll() {
    const latest = await provider.getBlockNumber();
    if (latest < fromBlock) return;
    const logs = await pool.queryFilter(pool.filters.NewCommitment(), fromBlock, latest);
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
    fromBlock = latest + 1;
  }

  await poll();
  setInterval(() => poll().catch(() => {}), 1000);

  const app = express();

  app.get("/health", (_req, res) => res.json({ ok: true, pool: poolAddr, count: commitments.length }));

  // Commitments ab Leaf-Index `from` (für Tree-Sync + Tag-Filter clientseitig).
  app.get("/commitments", async (req, res) => {
    await poll().catch(() => {});
    const from = Number(req.query.from || 0);
    const tag = req.query.tag !== undefined ? Number(req.query.tag) : null;
    let out = commitments.filter((c) => c.leafIndex >= from);
    if (tag !== null) out = out.filter((c) => c.viewTag === tag || c.viewTag === null);
    res.json({ total: commitments.length, commitments: out });
  });

  app.listen(PORT, () => {
    console.log(`OCP-Shield indexer on http://127.0.0.1:${PORT} (pool=${poolAddr})`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
