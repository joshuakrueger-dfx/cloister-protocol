import { JsonRpcProvider, Contract } from "ethers";
import { loadAbi } from "@cloister/contracts/deploy";
import {
  Keypair,
  Note,
  MerkleTree,
  ShieldedWallet,
  buildTransaction,
  syncFromChain,
  artifactPaths,
  OcpClient,
} from "@cloister/sdk";

const RPC = process.env.RPC || "http://127.0.0.1:8545";
const API = process.env.API || "http://127.0.0.1:8788";
const { wasmPath, zkeyPath } = artifactPaths();
const log = (...a) => console.log(...a);

async function main() {
  const provider = new JsonRpcProvider(RPC);
  const alice = await provider.getSigner(2); // Alices öffentliche On-chain-Identität
  const aliceAddr = await alice.getAddress();
  const client = new OcpClient(API);

  log("\n=== Cloister: Zahlung über die HTTP-API (Shielded Methods) ===\n");
  const cfg = await client.config();
  log("Provider-Config:", { pool: cfg.pool, token: cfg.token, chainId: cfg.chainId });

  const poolAbi = loadAbi("ShieldedPool", "ShieldedPool");
  const tokenAbi = loadAbi("MockERC20", "MockERC20");
  const poolRead = new Contract(cfg.pool, poolAbi, provider);
  const token = new Contract(cfg.token, tokenAbi, alice);

  // Shielded-Wallet von Alice
  const aliceKp = await Keypair.create();
  const tree = await new MerkleTree().init();
  const aliceW = new ShieldedWallet(aliceKp, tree, "Alice");

  // ---------- Onramp + Shield (öffentlich) ----------
  log("\n[Onramp] Alice mintet 1000 USDC und shieldet sie in den Pool…");
  await (await token.mint(aliceAddr, 1000)).wait();
  await (await token.approve(cfg.pool, 1000)).wait();
  await syncFromChain(poolRead, tree, [aliceW]);
  const shield = await buildTransaction({
    tree,
    inputs: [],
    outputs: [{ note: new Note({ amount: 1000n, pubKey: aliceKp.publicKey }), encPubKey: aliceKp.address().encPubKey }],
    extAmount: 1000n,
    wasmPath,
    zkeyPath,
  });
  const poolAlice = new Contract(cfg.pool, poolAbi, alice);
  await (
    await poolAlice.transact(
      [shield.proof.a, shield.proof.b, shield.proof.c],
      shield.root,
      shield.newRoot,
      shield.associationRoot,
      shield.inputNullifiers,
      shield.outputCommitments,
      [
        shield.extData.recipient,
        shield.extData.extAmount,
        shield.extData.relayer,
        shield.extData.fee,
        shield.extData.encryptedOutput1,
        shield.extData.encryptedOutput2,
      ],
    )
  ).wait();
  await syncFromChain(poolRead, tree, [aliceW]);
  log(`    Alice shielded balance: ${aliceW.balance()} USDC`);

  // ---------- OCP-Flow: an der Kasse bezahlen ----------
  const paymentId = "pay_demo1";
  log(`\n[Schritt 2] Payment-Details holen (paymentId=${paymentId})…`);
  const details = await client.paymentDetails(paymentId);
  const ta = details.transferAmounts.find((t) => t.shielded);
  log(`    shielded method: ${ta.method}, betrag: ${ta.assets[0].amount} ${ta.assets[0].asset}`);

  log("[Schritt 3] Tx-Details (Pool-Instruktion) holen…");
  const txd = await client.txDetails(paymentId, details.quote.id, "Base", "USDC");
  const amount = BigInt(txd.amount);
  const dfxPub = BigInt(txd.recipientShieldAddress.pubKey);
  const dfxEnc = txd.recipientShieldAddress.encPubKey;

  log("[Schritt 4] Proof bauen: Zahlung an DFX-ShieldAddress + Change an Alice…");
  await syncFromChain(poolRead, tree, [aliceW]);
  const note = aliceW.spendable()[0];
  const pay = await buildTransaction({
    tree,
    inputs: [{ note: note.note, privateKey: aliceKp.privateKey, index: note.index }],
    outputs: [
      { note: new Note({ amount, pubKey: dfxPub }), encPubKey: dfxEnc },
      { note: new Note({ amount: note.note.amount - amount, pubKey: aliceKp.publicKey }), encPubKey: aliceKp.address().encPubKey },
    ],
    extAmount: 0n,
    wasmPath,
    zkeyPath,
  });

  log("[Schritt 5] An den Relayer einreichen (kein Token-Move, Alice nie on-chain)…");
  const submit = await client.submit({
    chainId: cfg.chainId,
    proof: pay.proof,
    root: pay.root,
    newRoot: pay.newRoot,
    associationRoot: pay.associationRoot,
    inputNullifiers: pay.inputNullifiers,
    outputCommitments: pay.outputCommitments,
    extData: pay.extData,
    quoteId: details.quote.id,
  });
  aliceW.markSpent([note.index]);
  log(`    submitted: tx=${submit.txHash.slice(0, 14)}…  DFX shielded balance=${submit.dfxShieldedBalance} USDC`);

  const status = await client.status(paymentId);
  log(`    Quote-Status: ${status.status}`);

  // ---------- Settlement an den Händler ----------
  log("\n[Settle] DFX zahlt an den Händler aus…");
  const settle = await client.settle(paymentId);
  log(`    settled: tx=${settle.txHash.slice(0, 14)}…  Händler-Balance=${settle.merchantBalance} USDC`);

  // ---------- Privacy-Check ----------
  const payTx = await provider.getTransaction(submit.txHash);
  const aliceInTx = payTx.data.toLowerCase().includes(aliceAddr.slice(2).toLowerCase());
  const ok =
    status.status === "paid" &&
    submit.dfxShieldedBalance === "250" &&
    settle.merchantBalance === "250" &&
    payTx.from.toLowerCase() !== aliceAddr.toLowerCase() &&
    !aliceInTx;

  log("\n=== Ergebnis ===");
  log(`  Zahlung über Relayer, nicht von Alice:  ${payTx.from.toLowerCase() !== aliceAddr.toLowerCase() ? "✅" : "❌"}`);
  log(`  Alice-Adresse im Pay-Tx:                ${aliceInTx ? "JA ❌" : "NEIN ✅"}`);
  log(`  Quote bezahlt + Händler erhielt 250:    ${status.status === "paid" && settle.merchantBalance === "250" ? "✅" : "❌"}`);
  log(ok ? "\n✅ HTTP-E2E erfolgreich." : "\n❌ HTTP-E2E fehlgeschlagen.");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
