import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { JsonRpcProvider, Wallet, Contract } from "ethers";
import { loadAbi } from "@cloister/contracts/deploy";
import { Keypair, Note, MerkleTree, buildTransaction, syncFromChain, artifactPaths } from "@cloister/sdk";

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

const latest = await provider.getBlockNumber();
const tree = await new MerkleTree().init();
await syncFromChain(pool, tree, [], Math.max(0, latest - 2000));
console.log("Tree synced:", tree.leaves.length, "Commitments. Aktuelle laneRoot[0]:", (await tree.root()).toString().slice(0, 14), "…");

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
