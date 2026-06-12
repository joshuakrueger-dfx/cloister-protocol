// Kombinierter Testnet-Server (Relayer + Indexer + OCP-Config) gegen die bestehende
// Base-Sepolia-Deployment. Lauscht auf 0.0.0.0, damit das iPhone ihn über die Mac-LAN-IP
// erreicht. Relayer = Deployer-Key (funded). DFX-Empfänger + App-Konto deterministisch.
import express from "express";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { JsonRpcProvider, Wallet, Contract } from "ethers";
import { loadAbi } from "@cloister/contracts/deploy";
import { Keypair } from "@cloister/sdk";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..", "..", "..");
const dep = JSON.parse(readFileSync(resolve(root, "deployment.basesepolia.json"), "utf8"));
const env = Object.fromEntries(
  readFileSync(resolve(root, ".env.testnet"), "utf8").trim().split("\n").map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);

const PORT = Number(process.env.PORT || 8790);
const LAN = process.env.LAN_IP || "192.168.178.110";
const BASE = `http://${LAN}:${PORT}`;

// Feste Test-Identitäten (App + DFX) — deterministisch, damit Pre-Shield & App übereinstimmen.
export const APP_SCALAR = 1234567890123456789n;
export const DFX_SCALAR = 9876543210987654321n;

const proofTuple = (p) => [p.a, p.b, p.c];
const extTuple = (e) => [e.recipient, e.extAmount, e.relayer, e.fee, e.encryptedOutput1, e.encryptedOutput2];

async function main() {
  const provider = new JsonRpcProvider(dep.rpc);
  const relayer = new Wallet(env.BASE_SEPOLIA_DEPLOYER_KEY, provider);
  const abi = loadAbi("ShieldedPool", "ShieldedPool");
  const poolRead = new Contract(dep.pool, abi, provider);
  const poolRelay = new Contract(dep.pool, abi, relayer);

  const dfx = await Keypair.create(DFX_SCALAR);
  const dfxAddr = dfx.address();

  // Commitment-Cache (Hintergrund-Refresh) → /commitments antwortet sofort, kein WebView-Timeout.
  let cache = [];
  async function refresh() {
    try {
      const latest = await provider.getBlockNumber();
      const start = Math.max(0, latest - 40000);
      const CHUNK = 2000;
      let logs = [];
      for (let b = start; b <= latest; b += CHUNK) {
        const to = Math.min(b + CHUNK - 1, latest);
        logs = logs.concat(await poolRead.queryFilter(poolRead.filters.NewCommitment(), b, to));
      }
      cache = logs
        .map((l) => ({ leafIndex: Number(l.args[1]), commitment: l.args[0].toString(), encryptedOutput: l.args[2] }))
        .sort((a, b) => a.leafIndex - b.leafIndex);
    } catch (e) {
      console.log("refresh error:", e.shortMessage || e.message);
    }
  }
  await refresh();
  setInterval(() => refresh(), 15000);

  const app = express();
  app.use(express.json({ limit: "8mb" }));
  app.use((req, res, next) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Headers", "content-type");
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    console.log(new Date().toISOString().slice(11, 19), req.method, req.path, "from", req.ip);
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  app.get("/config", (_req, res) =>
    res.json({
      chainId: dep.chainId,
      pool: dep.pool,
      token: dep.token,
      relayer: `${BASE}/v1/shielded/submit`,
      indexer: `${BASE}/commitments`,
      dfxShieldAddress: { pubKey: dfxAddr.pubKey.toString(), encPubKey: dfxAddr.encPubKey },
      scan: "https://sepolia.basescan.org/tx/",
    }),
  );

  // Indexer: sofort aus dem Cache (Hintergrund-Refresh).
  app.get("/commitments", (req, res) => {
    const fromIdx = Number(req.query.from || 0);
    res.json({ total: cache.length, commitments: cache.filter((c) => c.leafIndex >= fromIdx) });
  });

  // Relayer: Proof broadcasten
  app.post("/v1/shielded/submit", async (req, res) => {
    try {
      const { proof, root, newRoot, inputNullifiers, outputCommitments, extData } = req.body;
      const tx = await poolRelay.transact(proofTuple(proof), root, newRoot, inputNullifiers, outputCommitments, extTuple(extData));
      const rc = await tx.wait();
      res.json({ status: "confirmed", txHash: rc.hash, scan: "https://sepolia.basescan.org/tx/" + rc.hash });
    } catch (e) {
      res.status(400).json({ error: String(e.shortMessage || e.message) });
    }
  });

  app.get("/health", (_req, res) => res.json({ ok: true, chainId: dep.chainId, pool: dep.pool }));

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Cloister Testnet-Server (Relayer+Indexer) auf ${BASE}`);
    console.log(`  pool=${dep.pool}  relayer=${relayer.address}`);
    console.log(`  DFX-ShieldAddress pubKey=${dfxAddr.pubKey.toString().slice(0, 14)}…`);
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
