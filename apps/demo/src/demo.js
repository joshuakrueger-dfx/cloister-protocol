import { JsonRpcProvider } from "ethers";
import {
  Keypair,
  Note,
  MerkleTree,
  ShieldedWallet,
  buildTransaction,
  artifactPaths,
} from "@ocp-shield/sdk";
import { deployAll } from "@ocp-shield/contracts/deploy";

const RPC = process.env.RPC || "http://127.0.0.1:8545";
const { wasmPath, zkeyPath } = artifactPaths();

const log = (...a) => console.log(...a);
const usdc = (n) => `${n} USDC`;

// proof/extData für den Contract-Call in Tupel-Arrays bringen
const proofTuple = (p) => [p.a, p.b, p.c];
const extTuple = (e) => [e.recipient, e.extAmount, e.relayer, e.fee, e.encryptedOutput1, e.encryptedOutput2];

async function applyTx(receipt, pool, tree, wallets) {
  const events = [];
  for (const lg of receipt.logs) {
    let parsed;
    try {
      parsed = pool.interface.parseLog(lg);
    } catch {
      continue;
    }
    if (parsed?.name === "NewCommitment") {
      events.push({ commitment: parsed.args[0], leafIndex: Number(parsed.args[1]), enc: parsed.args[2] });
    }
  }
  events.sort((a, b) => a.leafIndex - b.leafIndex);
  for (const e of events) {
    tree.insert(e.commitment);
    for (const w of wallets) await w.tryAdd(e.commitment, e.leafIndex, e.enc);
  }
}

async function send(pool, signer, t) {
  const tx = await pool
    .connect(signer)
    .transact(proofTuple(t.proof), t.root, t.newRoot, t.inputNullifiers, t.outputCommitments, extTuple(t.extData));
  return tx.wait();
}

async function main() {
  const provider = new JsonRpcProvider(RPC);
  const deployer = await provider.getSigner(0); // = Alice's öffentliche On-chain-Identität (zahlt Onramp/Deposit)
  const relayer = await provider.getSigner(1); // broadcastet abgeschirmte Txs
  const merchantAddr = await (await provider.getSigner(3)).getAddress();
  const aliceAddr = await deployer.getAddress();

  log("\n=== OCP-Shield E2E (local devnet) ===\n");
  log("Deploying stack (verifier, USDC, pool, registry)…");
  const { token, pool } = await deployAll(deployer);
  log("  pool:", await pool.getAddress());

  // Shielded-Identitäten
  const alice = await Keypair.create();
  const dfx = await Keypair.create();
  const tree = await new MerkleTree().init();
  const aliceW = new ShieldedWallet(alice, tree, "Alice");
  const dfxW = new ShieldedWallet(dfx, tree, "DFX");

  // Onramp: Alice bekommt USDC und genehmigt den Pool
  await (await token.mint(aliceAddr, 10_000)).wait();
  await (await token.connect(deployer).approve(await pool.getAddress(), 10_000)).wait();

  // ---------- 1) SHIELD (öffentlicher Deposit von Alices Wallet) ----------
  log("\n[1] SHIELD: Alice zahlt 1000 USDC in den Pool (öffentlich)…");
  const shield = await buildTransaction({
    tree,
    inputs: [],
    outputs: [{ note: new Note({ amount: 1000n, pubKey: alice.publicKey }), encPubKey: alice.address().encPubKey }],
    extAmount: 1000n,
    wasmPath,
    zkeyPath,
  });
  await applyTx(await send(pool, deployer, shield), pool, tree, [aliceW, dfxW]);
  log(`    Alice shielded balance: ${usdc(aliceW.balance())}`);
  log(`    Pool USDC reserve:      ${usdc(await token.balanceOf(await pool.getAddress()))}`);

  // ---------- 2) PAY (private interne Zahlung an DFX, via Relayer) ----------
  log("\n[2] PAY: Alice zahlt 250 USDC an DFX — abgeschirmt, broadcastet vom Relayer…");
  const aliceNote = aliceW.spendable()[0];
  const pay = await buildTransaction({
    tree,
    inputs: [{ note: aliceNote.note, privateKey: alice.privateKey, index: aliceNote.index }],
    outputs: [
      { note: new Note({ amount: 250n, pubKey: dfx.publicKey }), encPubKey: dfx.address().encPubKey },
      { note: new Note({ amount: 750n, pubKey: alice.publicKey }), encPubKey: alice.address().encPubKey },
    ],
    extAmount: 0n,
    fee: 0n,
    wasmPath,
    zkeyPath,
  });
  const payReceipt = await send(pool, relayer, pay);
  aliceW.markSpent([aliceNote.index]);
  await applyTx(payReceipt, pool, tree, [aliceW, dfxW]);

  // Privacy-Check: kommt die Tx vom Relayer? Taucht Alices Adresse irgendwo auf?
  const payTx = await provider.getTransaction(payReceipt.hash);
  const aliceInCalldata = payTx.data.toLowerCase().includes(aliceAddr.slice(2).toLowerCase());
  const tokenMoved = (await token.balanceOf(await pool.getAddress())) !== 1000n;
  log(`    DFX shielded balance:   ${usdc(dfxW.balance())}`);
  log(`    Alice shielded balance: ${usdc(aliceW.balance())} (Change)`);
  log(`    tx.from == Relayer:     ${payTx.from.toLowerCase() === (await relayer.getAddress()).toLowerCase()}`);
  log(`    Alice-Adresse im Tx:    ${aliceInCalldata ? "JA ❌" : "NEIN ✅"}`);
  log(`    On-chain Token bewegt:  ${tokenMoved ? "JA ❌" : "NEIN ✅ (voll abgeschirmt)"}`);

  // ---------- 3) SETTLE (DFX unshieldet an den Händler) ----------
  log("\n[3] SETTLE: DFX zahlt 250 USDC an den Händler aus (Unshield)…");
  const dfxNote = dfxW.spendable()[0];
  const settle = await buildTransaction({
    tree,
    inputs: [{ note: dfxNote.note, privateKey: dfx.privateKey, index: dfxNote.index }],
    outputs: [],
    extAmount: -250n,
    recipient: merchantAddr,
    wasmPath,
    zkeyPath,
  });
  await applyTx(await send(pool, relayer, settle), pool, tree, [aliceW, dfxW]);
  dfxW.markSpent([dfxNote.index]);
  log(`    Händler USDC balance:   ${usdc(await token.balanceOf(merchantAddr))}`);
  log(`    Pool USDC reserve:      ${usdc(await token.balanceOf(await pool.getAddress()))}`);

  // ---------- Bilanz ----------
  const ok =
    dfxW.balance() === 0n &&
    aliceW.balance() === 750n &&
    (await token.balanceOf(merchantAddr)) === 250n &&
    (await token.balanceOf(await pool.getAddress())) === 750n &&
    payTx.from.toLowerCase() === (await relayer.getAddress()).toLowerCase() &&
    !aliceInCalldata &&
    !tokenMoved;

  log("\n=== Ergebnis ===");
  log(ok ? "✅ E2E erfolgreich — Zahlung privat, Settlement korrekt, Bilanz stimmt." : "❌ E2E fehlgeschlagen — Invarianten verletzt.");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
