import { JsonRpcProvider, Contract } from "ethers";
import { deployAll } from "@cloister/contracts/deploy";
import { Keypair, Note, MerkleTree, ShieldedWallet, buildTransaction, syncFromChain, artifactPaths } from "@cloister/sdk";

const RPC = process.env.RPC || "http://127.0.0.1:8545";
const { wasmPath, zkeyPath } = artifactPaths();
const proofTuple = (p) => [p.a, p.b, p.c];
const extTuple = (e) => [e.recipient, e.extAmount, e.relayer, e.fee, e.encryptedOutput1, e.encryptedOutput2];

async function applyTx(rc, pool, tree, wallets) {
  const evs = [];
  for (const lg of rc.logs) {
    let p;
    try { p = pool.interface.parseLog(lg); } catch { continue; }
    if (p?.name === "NewCommitment") evs.push({ c: p.args[0], i: Number(p.args[1]), e: p.args[2] });
  }
  evs.sort((a, b) => a.i - b.i);
  for (const e of evs) { tree.insert(e.c); for (const w of wallets) await w.tryAdd(e.c, e.i, e.e); }
}

async function main() {
  const provider = new JsonRpcProvider(RPC);
  const deployer = await provider.getSigner(0);
  const { token, pool } = await deployAll(deployer);
  const aliceAddr = await deployer.getAddress();

  // Gas einer einzelnen on-chain Poseidon(2)-Hash-Operation (über einen Probe-Contract-Call als Tx)
  // hashLeftRight ist `view` → wir messen indirekt über transact-Komponenten.

  const alice = await Keypair.create();
  const tree = await new MerkleTree().init();
  const aliceW = new ShieldedWallet(alice, tree, "Alice");
  await (await token.mint(aliceAddr, 10000)).wait();
  await (await token.connect(deployer).approve(await pool.getAddress(), 10000)).wait();

  // SHIELD (2 Inserts, Dummy-Inputs)
  const shield = await buildTransaction({
    tree, inputs: [], outputs: [{ note: new Note({ amount: 1000n, pubKey: alice.publicKey }), encPubKey: alice.address().encPubKey }],
    extAmount: 1000n, wasmPath, zkeyPath,
  });
  const shTx = await pool.connect(deployer).transact(proofTuple(shield.proof), shield.root, shield.newRoot, shield.associationRoot, shield.inputNullifiers, shield.outputCommitments, extTuple(shield.extData));
  const shRc = await shTx.wait();
  await applyTx(shRc, pool, tree, [aliceW]);

  // PAY (1 Input, 2 Inserts)
  const n = aliceW.spendable()[0];
  const pay = await buildTransaction({
    tree, inputs: [{ note: n.note, privateKey: alice.privateKey, index: n.index }],
    outputs: [
      { note: new Note({ amount: 250n, pubKey: alice.publicKey }), encPubKey: alice.address().encPubKey },
      { note: new Note({ amount: 750n, pubKey: alice.publicKey }), encPubKey: alice.address().encPubKey },
    ],
    extAmount: 0n, wasmPath, zkeyPath,
  });
  const payRc = await (await pool.connect(deployer).transact(proofTuple(pay.proof), pay.root, pay.newRoot, pay.associationRoot, pay.inputNullifiers, pay.outputCommitments, extTuple(pay.extData))).wait();

  const levels = Number(await pool.levels());
  console.log("\n=== Gas-Messung (Off-chain-Insertion: Root-Transition im Proof) ===");
  console.log(`  Merkle-Tiefe (levels):        ${levels}`);
  console.log(`  transact SHIELD gasUsed:      ${shRc.gasUsed}`);
  console.log(`  transact PAY   gasUsed:       ${payRc.gasUsed}`);
  console.log(`  → 0 on-chain Poseidon-Hashes (Contract verifiziert nur den Proof + Root-Update)`);
  console.log(`  Vergleich altes Design (on-chain Insert): ~1.74M Gas/Tx\n`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
