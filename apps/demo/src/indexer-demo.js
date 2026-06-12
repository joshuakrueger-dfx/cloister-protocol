import { JsonRpcProvider, Contract } from "ethers";
import { loadAbi } from "@ocp-shield/contracts/deploy";
import {
  Keypair,
  Note,
  MerkleTree,
  ShieldedWallet,
  buildTransaction,
  syncFromChain,
  syncFromIndexer,
  artifactPaths,
  OcpClient,
} from "@ocp-shield/sdk";

const RPC = process.env.RPC || "http://127.0.0.1:8545";
const API = process.env.API || "http://127.0.0.1:8788";
const INDEXER = process.env.INDEXER || "http://127.0.0.1:8789";
const { wasmPath, zkeyPath } = artifactPaths();
const log = (...a) => console.log(...a);

// Hilfs-Shield: User zahlt `amount` öffentlich in den Pool (eigene Note).
async function shield(poolAbi, cfg, signer, kp, tree, amount) {
  const token = new Contract(cfg.token, loadAbi("MockERC20", "MockERC20"), signer);
  await (await token.mint(await signer.getAddress(), amount)).wait();
  await (await token.approve(cfg.pool, amount)).wait();
  await syncFromChain(new Contract(cfg.pool, poolAbi, signer.provider), tree, []);
  const t = await buildTransaction({
    tree,
    inputs: [],
    outputs: [{ note: new Note({ amount: BigInt(amount), pubKey: kp.publicKey }), encPubKey: kp.address().encPubKey }],
    extAmount: BigInt(amount),
    wasmPath,
    zkeyPath,
  });
  const pool = new Contract(cfg.pool, poolAbi, signer);
  await (
    await pool.transact(
      [t.proof.a, t.proof.b, t.proof.c],
      t.root,
      t.newRoot,
      t.inputNullifiers,
      t.outputCommitments,
      [t.extData.recipient, t.extData.extAmount, t.extData.relayer, t.extData.fee, t.extData.encryptedOutput1, t.extData.encryptedOutput2],
    )
  ).wait();
}

async function main() {
  const provider = new JsonRpcProvider(RPC);
  const client = new OcpClient(API);
  const cfg = await client.config();
  const poolAbi = loadAbi("ShieldedPool", "ShieldedPool");

  log("\n=== OCP-Shield: Indexer + View-Tags (Note-Discovery) ===\n");
  const driveTree = await new MerkleTree().init(); // nur zum Treiben der Shields

  // 4 Decoy-User shielden je 100 → Fremd-Notes, die der Tag-Filter verwerfen soll
  log("[setup] 4 Decoy-User + Alice shielden in den Pool…");
  for (let i = 0; i < 4; i++) {
    await shield(poolAbi, cfg, await provider.getSigner(4 + i), await Keypair.create(), driveTree, 100);
  }

  // Alice shieldet 1000
  const alice = await provider.getSigner(2);
  const aliceKp = await Keypair.create();
  await shield(poolAbi, cfg, alice, aliceKp, driveTree, 1000);

  // Alice synct ihr eigenes Wallet vom Indexer und zahlt 250 an DFX
  log("[pay]   Alice synct vom Indexer und zahlt 250 an DFX (via Relayer)…");
  const payTree = await new MerkleTree().init();
  const payW = new ShieldedWallet(aliceKp, payTree, "Alice");
  const paySync = await syncFromIndexer(INDEXER, payTree, [payW]);
  log(`        (pay-sync: leaves=${payTree.leaves.length} scanned=${paySync.scanned} tagMatched=${paySync.tagMatched} decrypted=${paySync.decrypted} spendable=${payW.spendable().length})`);
  const details = await client.paymentDetails("pay_idx");
  const txd = await client.txDetails("pay_idx", details.quote.id, "Base", "USDC");
  const note = payW.spendable()[0];
  const pay = await buildTransaction({
    tree: payTree,
    inputs: [{ note: note.note, privateKey: aliceKp.privateKey, index: note.index }],
    outputs: [
      { note: new Note({ amount: BigInt(txd.amount), pubKey: BigInt(txd.recipientShieldAddress.pubKey) }), encPubKey: txd.recipientShieldAddress.encPubKey },
      { note: new Note({ amount: note.note.amount - BigInt(txd.amount), pubKey: aliceKp.publicKey }), encPubKey: aliceKp.address().encPubKey },
    ],
    extAmount: 0n,
    wasmPath,
    zkeyPath,
  });
  await client.submit({
    chainId: cfg.chainId,
    proof: pay.proof,
    root: pay.root,
    newRoot: pay.newRoot,
    inputNullifiers: pay.inputNullifiers,
    outputCommitments: pay.outputCommitments,
    extData: pay.extData,
    quoteId: details.quote.id,
  });

  // Frisches Alice-Wallet entdeckt seine Notes NUR über Indexer + View-Tag
  log("[scan]  Frisches Wallet synct über den Indexer — View-Tag-Filter:\n");
  const scanTree = await new MerkleTree().init();
  const scanW = new ShieldedWallet(aliceKp, scanTree, "Alice");
  const stats = await syncFromIndexer(INDEXER, scanTree, [scanW]);

  const filtered = stats.scanned - stats.tagMatched;
  const pct = stats.scanned ? Math.round((filtered / stats.scanned) * 100) : 0;
  log(`    Commitments im Pool gesamt:        ${scanTree.leaves.length}`);
  log(`    verschlüsselte Notes gescannt:     ${stats.scanned}`);
  log(`    via View-Tag als Kandidat:         ${stats.tagMatched}`);
  log(`    durch Tag verworfen (ohne Decrypt): ${filtered}  (${pct}%)`);
  log(`    Alices Notes entschlüsselt:        ${stats.decrypted}`);

  const ok = stats.decrypted >= 2 && stats.tagMatched < stats.scanned;
  log("\n=== Ergebnis ===");
  log(
    ok
      ? "✅ Indexer + View-Tags: eigene Notes gefunden, Fremd-Notes ohne Decrypt verworfen (skaliert auf ~255/256)."
      : "❌ Discovery fehlgeschlagen.",
  );
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
