// Turnkey deployment of the full Cloister gnark stack to any EVM chain.
//
// Config via env vars (or a .env.testnet file at the repo root):
//   RPC                 (or BASE_SEPOLIA_RPC)          — JSON-RPC endpoint
//   DEPLOYER_KEY        (or BASE_SEPOLIA_DEPLOYER_KEY)  — funded deployer private key
//   PROVERD_URL         — Poseidon2 backend for the empty-root calc (default 127.0.0.1:8799)
//   ASSET               — asset symbol for the registry (default "USDC")
//   ASP                 — ASP address (default ZeroAddress = permissive dev mode)
//
// Deploys verifier + token + pool + registry, registers the pool, and writes
// deployment.<chainId>.json. Run a proverd (cmd/proverd) first.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { JsonRpcProvider, Wallet, NonceManager, ZeroAddress } from "ethers";
import { deployAll } from "@cloister/contracts/deploy";
import { useHttpBackend } from "@cloister/sdk";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..", "..", "..");

const fileEnv = existsSync(resolve(root, ".env.testnet"))
  ? Object.fromEntries(
      readFileSync(resolve(root, ".env.testnet"), "utf8").trim().split("\n").map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      }),
    )
  : {};
const cfg = (...keys) => {
  for (const key of keys) if (process.env[key] ?? fileEnv[key]) return process.env[key] ?? fileEnv[key];
  return undefined;
};

const RPC = cfg("RPC", "BASE_SEPOLIA_RPC");
const KEY = cfg("DEPLOYER_KEY", "BASE_SEPOLIA_DEPLOYER_KEY");
const PROVERD = cfg("PROVERD_URL") || "http://127.0.0.1:8799";
const ASSET = cfg("ASSET") || "USDC";
const ASP = cfg("ASP") || ZeroAddress;
if (!RPC || !KEY) {
  console.error("missing RPC and/or DEPLOYER_KEY (env vars or .env.testnet)");
  process.exit(1);
}

// the empty-tree root is Poseidon2 → needs a hash backend (proverd)
useHttpBackend(PROVERD);

const provider = new JsonRpcProvider(RPC);
const wallet = new NonceManager(new Wallet(KEY, provider));
const me = await wallet.getAddress();
const chainId = Number((await provider.getNetwork()).chainId);
console.log(`Deploying Cloister stack to chainId ${chainId} as ${me}…`);

const { token, pool, verifier, registry, initialRoot, numLanes } = await deployAll(wallet, {
  numLanes: 8,
  asp: ASP,
});

const levels = 20;
const poolAddr = await pool.getAddress();
const verifierAddr = await verifier.getAddress();
const tokenAddr = await token.getAddress();

const out = {
  chainId,
  rpc: RPC,
  asset: ASSET,
  pool: poolAddr,
  token: tokenAddr,
  verifier: verifierAddr,
  registry: await registry.getAddress(),
  initialRoot,
  numLanes,
  levels,
  asp: ASP,
  deployer: me,
};
const outPath = resolve(root, `deployment.${chainId}.json`);
// Record the deployment FIRST — the addresses are the valuable artifact; the registry
// entry is convenience and must never lose the deployment if it reverts.
writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log("\n✅ Deployed:");
for (const [k, v] of Object.entries(out)) console.log(" ", k.padEnd(12), v);
console.log("wrote", outPath);

try {
  await (await registry.register(chainId, ASSET, poolAddr, verifierAddr, tokenAddr, levels)).wait();
  console.log("✅ registered in PoolRegistry");
} catch (e) {
  console.warn("⚠️  registry.register skipped:", e.shortMessage || e.message);
}
