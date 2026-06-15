// Cloister device-deposit relayer for Base Sepolia.
//
// Pairs with the wallet's native ProveDeposit: the device proves a shield on-device;
// this relayer supplies the insertion context, funds the test token, and broadcasts.
//
//   GET  /config
//   GET  /v1/deposit/prepare?amount=X → { root, pairIndex, pairPathEls[19], extData, extDataHash }
//   POST /v1/deposit/submit           → mint X test USDC, approve, transact → { txHash, basescan }
//
// Robustness: the Merkle tree is kept IN MEMORY — synced once at startup (with multi-RPC
// fallback) and advanced locally after each submit — so flaky public-RPC eth_getLogs
// can't break per-request prepares. Each prepare still self-validates its root against
// the on-chain laneRoot before serving it.
//
// Run: PROVERD_URL=http://127.0.0.1:8799 FROM_BLOCK=<deployBlock> node src/deposit-relayer.mjs
import express from "express";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { JsonRpcProvider, Wallet, NonceManager, Contract, ZeroAddress } from "ethers";
import { loadAbi } from "@cloister/contracts/deploy";
import { MerkleTree, syncFromChain, encodeExtData, useHttpBackend } from "@cloister/sdk";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..", "..", "..");
const env = existsSync(resolve(root, ".env.testnet"))
  ? Object.fromEntries(readFileSync(resolve(root, ".env.testnet"), "utf8").trim().split("\n").map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }))
  : {};
const dep = JSON.parse(readFileSync(resolve(root, "deployment.84532.json"), "utf8"));
const RPC = process.env.RPC || env.BASE_SEPOLIA_RPC || "https://base-sepolia-rpc.publicnode.com";
const KEY = process.env.DEPLOYER_KEY || env.BASE_SEPOLIA_DEPLOYER_KEY;
const PROVERD = process.env.PROVERD_URL || "http://127.0.0.1:8799";
const PORT = Number(process.env.PORT || 8790);
const LAN = process.env.LAN_IP || "192.168.178.110";
const BASE = `http://${LAN}:${PORT}`;
const FROM_BLOCK = Number(process.env.FROM_BLOCK || 0);
const RPCS = [RPC, "https://base-sepolia.gateway.tenderly.co", "https://base-sepolia-rpc.publicnode.com", "https://base-sepolia.drpc.org"]
  .filter((v, i, a) => v && a.indexOf(v) === i);

useHttpBackend(PROVERD); // Poseidon2 for tree root + pair path

const provider = new JsonRpcProvider(RPC);
const wallet = new NonceManager(new Wallet(KEY, provider));
const abi = loadAbi("ShieldedPool", "ShieldedPool");
const tokenAbi = loadAbi("MockERC20", "MockERC20");
const pool = new Contract(dep.pool, abi, wallet);
const poolRead = new Contract(dep.pool, abi, provider);
const token = new Contract(dep.token, tokenAbi, wallet);

const extTuple = (e) => [e.recipient, e.extAmount, e.relayer, e.fee, e.encryptedOutput1, e.encryptedOutput2];
const depositExtData = (amount) => ({ recipient: ZeroAddress, extAmount: String(amount), relayer: ZeroAddress, fee: "0", encryptedOutput1: "0x", encryptedOutput2: "0x" });

// in-memory tree, the relayer's source of truth for insertion context
let memTree;
async function laneRoot0() {
  return (await poolRead.laneRoot(0)).toString();
}
// Build the tree once, trying each RPC's eth_getLogs until one yields a tree whose root
// matches the on-chain laneRoot.
async function syncMemTree() {
  const target = await laneRoot0();
  for (const r of RPCS) {
    try {
      const pr = new Contract(dep.pool, abi, new JsonRpcProvider(r));
      const tree = await new MerkleTree().init();
      await syncFromChain(pr, tree, [], FROM_BLOCK);
      if ((await tree.root()).toString() === target) {
        console.log(`tree synced via ${r}: ${tree.leaves.length} leaves`);
        memTree = tree;
        return;
      }
      console.log(`sync via ${r}: root mismatch (rpc lag), trying next`);
    } catch (e) {
      console.log(`sync via ${r} failed: ${e.shortMessage || e.code || e.message}`);
    }
  }
  throw new Error("could not sync tree from any RPC");
}

const app = express();
app.use((req, res, next) => {
  const t0 = Date.now();
  console.log(new Date().toISOString(), "→", req.method, req.url, "from", req.socket.remoteAddress);
  res.on("finish", () => console.log(new Date().toISOString(), "←", res.statusCode, req.url, `${Date.now() - t0}ms`));
  next();
});
app.use((req, res, next) => { res.header("Access-Control-Allow-Origin", "*"); res.header("Access-Control-Allow-Headers", "content-type"); res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS"); if (req.method === "OPTIONS") return res.sendStatus(204); next(); });
app.use(express.json({ limit: "2mb" }));

app.get("/config", (_req, res) => res.json({
  chainId: dep.chainId, pool: dep.pool, token: dep.token, verifier: dep.verifier,
  prepare: `${BASE}/v1/deposit/prepare`, submit: `${BASE}/v1/deposit/submit`, engine: BASE,
}));

app.get("/v1/deposit/prepare", async (req, res) => {
  try {
    const amount = BigInt(req.query.amount || "0");
    if (amount <= 0n) return res.status(400).json({ error: "amount required" });
    if (!memTree) await syncMemTree();
    // self-validate against chain; on drift, re-sync once
    if ((await memTree.root()).toString() !== (await laneRoot0())) await syncMemTree();
    const rootVal = (await memTree.root()).toString();
    const pairIndex = Math.floor(memTree.leaves.length / 2);
    const { pathElements } = await memTree.pairPath(pairIndex);
    const ext = depositExtData(amount.toString());
    res.json({ root: rootVal, pairIndex, pairPathEls: pathElements.map((x) => x.toString()), extData: ext, extDataHash: encodeExtData(ext).toString() });
  } catch (e) {
    res.status(503).json({ error: e.shortMessage || e.message });
  }
});

app.post("/v1/deposit/submit", async (req, res) => {
  try {
    const { a, b, c, publicSignals } = req.body;
    const amount = BigInt(publicSignals[1]);
    const ext = depositExtData(amount.toString());
    if (BigInt(encodeExtData(ext).toString()) !== BigInt(publicSignals[2])) {
      return res.status(400).json({ error: "extDataHash mismatch" });
    }
    await (await token.mint(await wallet.getAddress(), amount)).wait();
    await (await token.approve(dep.pool, amount)).wait();
    const tx = await pool.transact(
      [a, b, c], publicSignals[0], publicSignals[7], publicSignals[9],
      [publicSignals[3], publicSignals[4]], [publicSignals[5], publicSignals[6]], extTuple(ext),
    );
    const rc = await tx.wait();
    // advance the in-memory tree with the two new output commitments
    if (memTree) { memTree.insert(publicSignals[5]); memTree.insert(publicSignals[6]); }
    res.json({ status: "shielded", txHash: rc.hash, basescan: `https://sepolia.basescan.org/tx/${rc.hash}`, amount: amount.toString() });
  } catch (e) {
    res.status(400).json({ error: e.shortMessage || e.message });
  }
});

app.listen(PORT, "0.0.0.0", async () => {
  console.log(`deposit-relayer on ${BASE} (pool ${dep.pool}, chain ${dep.chainId})`);
  try { await syncMemTree(); } catch (e) { console.log("startup sync deferred:", e.message); }
});
