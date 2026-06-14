// Cloister device-deposit relayer for Base Sepolia.
//
// Pairs with the wallet's native ProveDeposit: the device proves a shield on-device;
// this relayer supplies the insertion context, funds the test token, and broadcasts.
//
//   GET  /config                  → addresses + endpoint URLs
//   GET  /v1/deposit/prepare?amount=X → { root, pairIndex, pairPathEls[19], extData, extDataHash }
//   POST /v1/deposit/submit       → mint X test USDC, approve, transact → { txHash, basescan }
//
// Run: PROVERD_URL=http://127.0.0.1:8799 node src/deposit-relayer.mjs
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

useHttpBackend(PROVERD); // Poseidon2 for tree root + pair path

const provider = new JsonRpcProvider(RPC);
const wallet = new NonceManager(new Wallet(KEY, provider));
const abi = loadAbi("ShieldedPool", "ShieldedPool");
const tokenAbi = loadAbi("MockERC20", "MockERC20");
const pool = new Contract(dep.pool, abi, wallet);
const poolRead = new Contract(dep.pool, abi, provider);
const token = new Contract(dep.token, tokenAbi, wallet);

const extTuple = (e) => [e.recipient, e.extAmount, e.relayer, e.fee, e.encryptedOutput1, e.encryptedOutput2];
function depositExtData(amount) {
  return { recipient: ZeroAddress, extAmount: String(amount), relayer: ZeroAddress, fee: "0", encryptedOutput1: "0x", encryptedOutput2: "0x" };
}

async function freshTree() {
  const tree = await new MerkleTree().init();
  // Fresh pool → empty tree, no event scan needed (avoids a from-block-0 getLogs on Sepolia).
  const next = Number(await poolRead.laneNextIndex(0));
  if (next === 0) return tree;
  await syncFromChain(poolRead, tree, [], Number(process.env.FROM_BLOCK || 0));
  return tree;
}

const app = express();
app.use((req, res, next) => { res.header("Access-Control-Allow-Origin", "*"); res.header("Access-Control-Allow-Headers", "content-type"); res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS"); if (req.method === "OPTIONS") return res.sendStatus(204); next(); });
app.use(express.json({ limit: "2mb" }));

app.get("/config", async (_req, res) => {
  res.json({
    chainId: dep.chainId, pool: dep.pool, token: dep.token, verifier: dep.verifier,
    prepare: `${BASE}/v1/deposit/prepare`, submit: `${BASE}/v1/deposit/submit`, engine: BASE,
  });
});

app.get("/v1/deposit/prepare", async (req, res) => {
  try {
    const amount = BigInt(req.query.amount || "0");
    if (amount <= 0n) return res.status(400).json({ error: "amount required" });
    const tree = await freshTree();
    const pairIndex = Math.floor(tree.leaves.length / 2);
    const { pathElements } = await tree.pairPath(pairIndex);
    const rootVal = (await tree.root()).toString();
    const ext = depositExtData(amount.toString());
    const extDataHash = encodeExtData(ext).toString();
    res.json({
      root: rootVal,
      pairIndex,
      pairPathEls: pathElements.map((x) => x.toString()),
      extData: ext,
      extDataHash,
    });
  } catch (e) {
    res.status(400).json({ error: e.shortMessage || e.message });
  }
});

app.post("/v1/deposit/submit", async (req, res) => {
  try {
    const { a, b, c, publicSignals } = req.body;
    const amount = BigInt(publicSignals[1]); // publicAmount == deposited amount
    const ext = depositExtData(amount.toString());
    // sanity: the proof's extDataHash must match what we'll submit
    if (BigInt(encodeExtData(ext).toString()) !== BigInt(publicSignals[2])) {
      return res.status(400).json({ error: "extDataHash mismatch" });
    }
    // fund the deposit (test chain: mint freely), then broadcast the device's proof
    await (await token.mint(await wallet.getAddress(), amount)).wait();
    await (await token.approve(dep.pool, amount)).wait();
    const tx = await pool.transact(
      [a, b, c],
      publicSignals[0], // oldRoot
      publicSignals[7], // newRoot
      publicSignals[9], // associationRoot
      [publicSignals[3], publicSignals[4]], // nullifiers
      [publicSignals[5], publicSignals[6]], // commitments
      extTuple(ext),
    );
    const rc = await tx.wait();
    res.json({ status: "shielded", txHash: rc.hash, basescan: `https://sepolia.basescan.org/tx/${rc.hash}`, amount: amount.toString() });
  } catch (e) {
    res.status(400).json({ error: e.shortMessage || e.message });
  }
});

app.listen(PORT, "0.0.0.0", () => console.log(`deposit-relayer on ${BASE} (pool ${dep.pool}, chain ${dep.chainId})`));
