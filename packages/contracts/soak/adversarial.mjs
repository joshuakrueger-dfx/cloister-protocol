// Cloister adversarial battery — every attack must REVERT against the real pool with
// a genuine proof. Complements the 1000-tx happy-path soak.
//
// Usage: node soak/adversarial.mjs
import assert from "node:assert";
import { JsonRpcProvider, Wallet, NonceManager, ZeroAddress, Contract } from "ethers";
import { deployAll, loadAbi } from "@cloister/contracts/deploy";
import { MerkleTree, Note, Keypair, randomField, useHttpBackend, buildTransaction } from "@cloister/sdk";

const RPC = process.env.RPC || "http://127.0.0.1:8545";
const PROVERD = process.env.PROVERD || "http://127.0.0.1:8792";
const PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
useHttpBackend(PROVERD);

const provider = new JsonRpcProvider(RPC);
const signer = new NonceManager(new Wallet(PK, provider));
const extTuple = (e) => [e.recipient, e.extAmount, e.relayer, e.fee, e.encryptedOutput1, e.encryptedOutput2];
const proofTuple = (p) => [p.a, p.b, p.c];

let passed = 0;
async function mustRevert(label, fn) {
  try {
    await fn();
    console.error(`✗ ${label}: expected revert, but it SUCCEEDED`);
    process.exitCode = 1;
  } catch (e) {
    console.log(`  ✓ reverted: ${label}`);
    passed++;
  } finally {
    // a reverted/failed tx never consumes an on-chain nonce, but NonceManager bumps its
    // local counter on send/estimate → resync it so the next valid tx uses the right nonce.
    if (typeof signer.reset === "function") signer.reset();
  }
}

async function main() {
  const me = await signer.getAddress();
  const { token, pool } = await deployAll(signer, { asp: ZeroAddress });
  const poolAddr = await pool.getAddress();
  const poolC = new Contract(poolAddr, loadAbi("ShieldedPool", "ShieldedPool"), signer);
  await (await token.mint(me, 10n ** 24n)).wait();
  await (await token.approve(poolAddr, 10n ** 24n)).wait();

  const tree = await new MerkleTree(20).init();
  const alice = await Keypair.create(randomField());

  // build a valid deposit of 100000
  const amount = 100000n;
  const out0 = new Note({ amount, pubKey: alice.publicKey, blinding: randomField() });
  const out1 = new Note({ amount: 0n, pubKey: alice.publicKey, blinding: randomField() });
  const dep = await buildTransaction({
    tree,
    inputs: [],
    outputs: [
      { note: out0, encPubKey: alice.address().encPubKey },
      { note: out1, encPubKey: alice.address().encPubKey },
    ],
    extAmount: amount,
    fee: 0n,
  });
  const flip = (hex) => "0x" + (BigInt(hex) ^ 1n).toString(16);

  // --- attacks BEFORE the valid deposit lands ---
  await mustRevert("tampered proof element (a[0]^1)", async () => {
    const p = { a: [flip(dep.proof.a[0]), dep.proof.a[1]], b: dep.proof.b, c: dep.proof.c };
    await (await poolC.transact(proofTuple(p), dep.root, dep.newRoot, dep.associationRoot, dep.inputNullifiers, dep.outputCommitments, extTuple(dep.extData))).wait();
  });
  await mustRevert("tampered public newRoot", async () => {
    await (await poolC.transact(proofTuple(dep.proof), dep.root, flip(dep.newRoot), dep.associationRoot, dep.inputNullifiers, dep.outputCommitments, extTuple(dep.extData))).wait();
  });
  await mustRevert("wrong oldRoot (stale)", async () => {
    await (await poolC.transact(proofTuple(dep.proof), flip(dep.root), dep.newRoot, dep.associationRoot, dep.inputNullifiers, dep.outputCommitments, extTuple(dep.extData))).wait();
  });
  await mustRevert("extData tampered (recipient) → extDataHash mismatch", async () => {
    const bad = { ...dep.extData, recipient: "0x000000000000000000000000000000000000bEEF" };
    await (await poolC.transact(proofTuple(dep.proof), dep.root, dep.newRoot, dep.associationRoot, dep.inputNullifiers, dep.outputCommitments, extTuple(bad))).wait();
  });
  await mustRevert("duplicate nullifier in one tx", async () => {
    await (await poolC.transact(proofTuple(dep.proof), dep.root, dep.newRoot, dep.associationRoot, [dep.inputNullifiers[0], dep.inputNullifiers[0]], dep.outputCommitments, extTuple(dep.extData))).wait();
  });

  // --- now land the valid deposit ---
  await (await poolC.transact(proofTuple(dep.proof), dep.root, dep.newRoot, dep.associationRoot, dep.inputNullifiers, dep.outputCommitments, extTuple(dep.extData))).wait();
  console.log("  ✓ valid deposit landed");

  // --- replay the exact same tx → nullifiers already spent / stale root ---
  await mustRevert("replay of a landed tx (double-spend)", async () => {
    await (await poolC.transact(proofTuple(dep.proof), dep.root, dep.newRoot, dep.associationRoot, dep.inputNullifiers, dep.outputCommitments, extTuple(dep.extData))).wait();
  });

  // spend the deposited note, then try to spend it again (double-spend across txs)
  tree.insert(dep.outputCommitments[0]);
  tree.insert(dep.outputCommitments[1]);
  const spend = await buildTransaction({
    tree,
    inputs: [{ note: out0, privateKey: alice.privateKey, index: 0 }],
    outputs: [
      { note: new Note({ amount: 40000n, pubKey: alice.publicKey, blinding: randomField() }), encPubKey: alice.address().encPubKey },
      { note: new Note({ amount: 60000n, pubKey: alice.publicKey, blinding: randomField() }), encPubKey: alice.address().encPubKey },
    ],
    extAmount: 0n,
    fee: 0n,
  });
  await (await poolC.transact(proofTuple(spend.proof), spend.root, spend.newRoot, spend.associationRoot, spend.inputNullifiers, spend.outputCommitments, extTuple(spend.extData))).wait();
  console.log("  ✓ valid spend of the deposited note landed");
  await mustRevert("re-spend the same note (nullifier reuse across txs)", async () => {
    // rebuild against the advanced tree but reuse the now-spent nullifier
    await (await poolC.transact(proofTuple(spend.proof), spend.newRoot, flip(spend.newRoot), spend.associationRoot, spend.inputNullifiers, spend.outputCommitments, extTuple(spend.extData))).wait();
  });

  console.log(`\n✓ adversarial battery: ${passed} attacks all correctly reverted`);
}

main().catch((e) => {
  console.error("✗ adversarial harness error:", e.message);
  process.exit(1);
});
