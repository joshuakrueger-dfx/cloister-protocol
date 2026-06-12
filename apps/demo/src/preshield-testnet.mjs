import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { JsonRpcProvider, Wallet, Contract } from "ethers";
import { loadAbi } from "@cloister/contracts/deploy";
import { Keypair, Note, MerkleTree, buildTransaction, syncFromIndexer, artifactPaths } from "@cloister/sdk";

// Shieldet eine Note für die feste App-Identität (APP_SCALAR), damit die App etwas zu
// bezahlen hat. MUSS mit cloister-pay.html / server-testnet APP_SCALAR übereinstimmen.
const APP_SCALAR = 1234567890123456789n;
const AMOUNT = 1000n;

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..", "..", "..");
const dep = JSON.parse(readFileSync(resolve(root, "deployment.basesepolia.json"), "utf8"));
const env = Object.fromEntries(
  readFileSync(resolve(root, ".env.testnet"), "utf8").trim().split("\n").map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const { wasmPath, zkeyPath } = artifactPaths();
const extTuple = (e) => [e.recipient, e.extAmount, e.relayer, e.fee, e.encryptedOutput1, e.encryptedOutput2];

const provider = new JsonRpcProvider(dep.rpc);
const deployer = new Wallet(env.BASE_SEPOLIA_DEPLOYER_KEY, provider);
const poolAbi = loadAbi("ShieldedPool", "ShieldedPool");
const tokenAbi = loadAbi("MockERC20", "MockERC20");
const pool = new Contract(dep.pool, poolAbi, provider);
const token = new Contract(dep.token, tokenAbi, deployer);

const app = await Keypair.create(APP_SCALAR);
console.log("App-Shield-Address pubKey:", app.publicKey.toString().slice(0, 16), "…");

// Vollständigen Lane-0-Baum direkt von der Chain holen und gegen die
// On-Chain-Root verifizieren. Der Indexer cached nur ein rollendes Fenster
// (→ unvollständiger Baum → "stale or unknown root"), und ein einzelner
// getLogs über die ganze History lehnt der öffentliche RPC ab — daher
// chunked. Alle Test-Txs nutzen transact() = Lane 0, also leafIndex == lokal.
const levels = Number(await pool.levels());
const laneSize = 1 << levels;
const expected = Number(await pool.laneNextIndex(0n));
const onchainRoot = (await pool.laneRoot(0n)).toString();
const latest = await provider.getBlockNumber();
const CHUNK = 2000;
const WINDOW = Number(process.env.CLOISTER_SCAN_WINDOW ?? 300000);
const collected = [];
for (let b = Math.max(0, latest - WINDOW); b <= latest; b += CHUNK + 1) {
  const logs = await pool.queryFilter(pool.filters.NewCommitment(), b, Math.min(b + CHUNK, latest));
  for (const l of logs) collected.push({ commitment: l.args[0], leafIndex: Number(l.args[1]) });
}
const tree = await new MerkleTree().init();
collected
  .filter((e) => Math.floor(e.leafIndex / laneSize) === 0) // nur Lane 0
  .sort((a, b) => a.leafIndex - b.leafIndex)
  .forEach((e) => { if (e.leafIndex >= tree.leaves.length) tree.insert(e.commitment); });
const localRoot = (await tree.root()).toString();
console.log(`Tree (Lane 0): ${tree.leaves.length}/${expected} Leaves, Root-Match: ${localRoot === onchainRoot}`);
if (localRoot !== onchainRoot) {
  throw new Error(
    `Root-Mismatch (local ${localRoot.slice(0, 12)}… vs chain ${onchainRoot.slice(0, 12)}…). ` +
      `Scan-Fenster vergrößern: CLOISTER_SCAN_WINDOW=600000 node src/preshield-testnet.mjs`,
  );
}

console.log("Mint + approve…");
await (await token.mint(deployer.address, AMOUNT)).wait();
await (await token.approve(dep.pool, AMOUNT)).wait();

console.log("Shield", AMOUNT.toString(), "an App…");
const shield = await buildTransaction({
  tree, inputs: [],
  outputs: [{ note: new Note({ amount: AMOUNT, pubKey: app.publicKey }), encPubKey: app.address().encPubKey }],
  extAmount: AMOUNT, wasmPath, zkeyPath,
});
const rc = await (await pool.connect(deployer).transact(
  [shield.proof.a, shield.proof.b, shield.proof.c], shield.root, shield.newRoot,
  shield.inputNullifiers, shield.outputCommitments, extTuple(shield.extData),
)).wait();
console.log("\n✅ Pre-Shield gelandet:");
console.log("  tx:", "https://sepolia.basescan.org/tx/" + rc.hash);
console.log("  → App hat jetzt 1000 USDC shielded Balance auf Base Sepolia.");
