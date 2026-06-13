import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { JsonRpcProvider, Wallet, Contract, parseEther } from "ethers";
import { loadAbi } from "@cloister/contracts/deploy";
import { Keypair, Note, MerkleTree, ShieldedWallet, buildTransaction, syncFromChain, artifactPaths } from "@cloister/sdk";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..", "..", "..");
const { wasmPath, zkeyPath } = artifactPaths();
const dep = JSON.parse(readFileSync(resolve(root, "deployment.basesepolia.json"), "utf8"));
const env = Object.fromEntries(
  readFileSync(resolve(root, ".env.testnet"), "utf8").trim().split("\n").map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);

const SCAN = "https://sepolia.basescan.org/tx/";
const log = (...a) => console.log(...a);
const proofTuple = (p) => [p.a, p.b, p.c];
const extTuple = (e) => [e.recipient, e.extAmount, e.relayer, e.fee, e.encryptedOutput1, e.encryptedOutput2];

async function applyTx(rc, pool, tree, wallets) {
  const evs = [];
  for (const lg of rc.logs) {
    let p; try { p = pool.interface.parseLog(lg); } catch { continue; }
    if (p?.name === "NewCommitment") evs.push({ c: p.args[0], i: Number(p.args[1]), e: p.args[2] });
  }
  evs.sort((a, b) => a.i - b.i);
  for (const e of evs) { tree.insert(e.c); for (const w of wallets) await w.tryAdd(e.c, e.i, e.e); }
}
const send = (pool, signer, t) => pool.connect(signer).transact(proofTuple(t.proof), t.root, t.newRoot, t.associationRoot, t.inputNullifiers, t.outputCommitments, extTuple(t.extData)).then((tx) => tx.wait());

async function main() {
  const provider = new JsonRpcProvider(dep.rpc);
  const alice = new Wallet(env.BASE_SEPOLIA_DEPLOYER_KEY, provider); // öffentliche Identität + Onramp
  const relayer = Wallet.createRandom().connect(provider); // separater Broadcaster
  const merchant = Wallet.createRandom().address;
  const poolAbi = loadAbi("ShieldedPool", "ShieldedPool");
  const tokenAbi = loadAbi("MockERC20", "MockERC20");
  const pool = new Contract(dep.pool, poolAbi, provider);
  const token = new Contract(dep.token, tokenAbi, alice);

  log("\n=== Cloister On-Chain Test (Base Sepolia) ===");
  log("Alice :", alice.address);
  log("Relayer:", relayer.address, "(frisch, wird finanziert)");

  // Relayer mit Gas versorgen
  log("\n[0] Relayer mit 0.02 ETH finanzieren…");
  await (await alice.sendTransaction({ to: relayer.address, value: parseEther("0.02") })).wait();

  const fromBlock = await provider.getBlockNumber();
  const aliceKp = await Keypair.create();
  const dfxKp = await Keypair.create();
  const tree = await new MerkleTree().init();
  const aliceW = new ShieldedWallet(aliceKp, tree, "Alice");
  const dfxW = new ShieldedWallet(dfxKp, tree, "DFX");

  // Onramp
  log("[1] Mint 1000 USDC + approve…");
  await (await token.mint(alice.address, 1000)).wait();
  await (await token.approve(dep.pool, 1000)).wait();
  await syncFromChain(pool, tree, [], fromBlock);

  // SHIELD (öffentlich, von Alice)
  log("[2] SHIELD 1000 (öffentlich)…");
  const shield = await buildTransaction({ tree, inputs: [], outputs: [{ note: new Note({ amount: 1000n, pubKey: aliceKp.publicKey }), encPubKey: aliceKp.address().encPubKey }], extAmount: 1000n, wasmPath, zkeyPath });
  const shRc = await send(pool, alice, shield);
  await applyTx(shRc, pool, tree, [aliceW, dfxW]);
  log("    shield tx:", SCAN + shRc.hash);

  // PAY (abgeschirmt, via Relayer)
  log("[3] PAY 250 an DFX — abgeschirmt, via Relayer…");
  const n = aliceW.spendable()[0];
  const pay = await buildTransaction({
    tree,
    inputs: [{ note: n.note, privateKey: aliceKp.privateKey, index: n.index }],
    outputs: [
      { note: new Note({ amount: 250n, pubKey: dfxKp.publicKey }), encPubKey: dfxKp.address().encPubKey },
      { note: new Note({ amount: 750n, pubKey: aliceKp.publicKey }), encPubKey: aliceKp.address().encPubKey },
    ],
    extAmount: 0n, wasmPath, zkeyPath,
  });
  const payRc = await send(pool, relayer, pay);
  aliceW.markSpent([n.index]);
  await applyTx(payRc, pool, tree, [aliceW, dfxW]);
  log("    pay tx:", SCAN + payRc.hash);

  // SETTLE (DFX → Händler)
  log("[4] SETTLE 250 an Händler…");
  const dn = dfxW.spendable()[0];
  const settle = await buildTransaction({ tree, inputs: [{ note: dn.note, privateKey: dfxKp.privateKey, index: dn.index }], outputs: [], extAmount: -250n, recipient: merchant, wasmPath, zkeyPath });
  const seRc = await send(pool, relayer, settle);
  log("    settle tx:", SCAN + seRc.hash);

  // Verifikation on-chain
  const payTx = await provider.getTransaction(payRc.hash);
  const aliceInPay = payTx.data.toLowerCase().includes(alice.address.slice(2).toLowerCase());
  const merchantBal = await token.balanceOf(merchant);
  log("\n=== Ergebnis (on-chain, Base Sepolia) ===");
  log("  Händler erhielt:        ", merchantBal.toString(), "USDC", merchantBal === 250n ? "✅" : "❌");
  log("  Pay-Tx from == Relayer: ", payTx.from.toLowerCase() === relayer.address.toLowerCase() ? "✅ (nicht Alice)" : "❌");
  log("  Alice-Adresse im Pay-Tx:", aliceInPay ? "JA ❌" : "NEIN ✅");
  log("\n→ Auf Basescan ansehen: Pay-Tx kommt vom Relayer, keine Alice-Adresse, keine Token-Bewegung in der Pay-Tx.");
}

main().catch((e) => { console.error(e); process.exit(1); });
