import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { JsonRpcProvider, Wallet } from "ethers";
import { deployAll } from "@cloister/contracts/deploy";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..", "..", "..");

const env = Object.fromEntries(
  readFileSync(resolve(root, ".env.testnet"), "utf8")
    .trim()
    .split("\n")
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const provider = new JsonRpcProvider(env.BASE_SEPOLIA_RPC);
const wallet = new Wallet(env.BASE_SEPOLIA_DEPLOYER_KEY, provider);
const chainId = Number((await provider.getNetwork()).chainId);
console.log("Deploying Cloister stack to Base Sepolia (chainId", chainId + ")…");
console.log("deployer:", wallet.address);

const { token, pool, verifier, registry, initialRoot, numLanes } = await deployAll(wallet, { numLanes: 8 });

const out = {
  chainId,
  rpc: env.BASE_SEPOLIA_RPC,
  pool: await pool.getAddress(),
  token: await token.getAddress(),
  verifier: await verifier.getAddress(),
  registry: await registry.getAddress(),
  initialRoot,
  numLanes,
  deployer: wallet.address,
};
writeFileSync(resolve(root, "deployment.basesepolia.json"), JSON.stringify(out, null, 2));

console.log("\n✅ Deployed:");
for (const [k, v] of Object.entries(out)) console.log(" ", k.padEnd(12), v);
console.log("\nBasescan:");
console.log("  pool    https://sepolia.basescan.org/address/" + out.pool);
console.log("  token   https://sepolia.basescan.org/address/" + out.token);
