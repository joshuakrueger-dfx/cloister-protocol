import express from "express";
import { JsonRpcProvider, Contract } from "ethers";
import { deployAll, loadAbi } from "@cloister/contracts/deploy";
import { screenApplicant } from "./kyc.js";
import {
  Keypair,
  MerkleTree,
  Note,
  ShieldedWallet,
  buildTransaction,
  syncFromChain,
  useHttpBackend,
} from "@cloister/sdk";

const RPC = process.env.RPC || "http://127.0.0.1:8545";
const PORT = Number(process.env.PORT || 8788);
const BASE = `http://127.0.0.1:${PORT}`;
// gnark-Backend: Hashing (Poseidon2) + Proving (Groth16) laufen über proverd (Go).
// Der Server baut Witness + Proof für /v1/shield und /settle darüber — kein snarkjs.
const PROVERD = process.env.PROVERD || "http://127.0.0.1:8799";
useHttpBackend(PROVERD);

const proofTuple = (p) => [p.a, p.b, p.c];
const extTuple = (e) => [e.recipient, e.extAmount, e.relayer, e.fee, e.encryptedOutput1, e.encryptedOutput2];

async function main() {
  const provider = new JsonRpcProvider(RPC);
  const deployer = await provider.getSigner(0);
  const relayer = await provider.getSigner(1);
  const merchant = await (await provider.getSigner(3)).getAddress();

  console.log("Deploying stack…");
  // ASP_ENFORCE=1 → der Deployer ist Association-Set-Provider und die Compliance-Erzwingung
  // (knownAspRoot) ist aktiv (so fährt die App den echten Level-3-Pfad). Ohne das Flag bleibt
  // der Pool permissiv (asp=0), damit die PoC-Demos (demo:api/demo:indexer) unverändert laufen.
  const ASP_ENFORCE = process.env.ASP_ENFORCE === "1";
  const deployerAddr = await deployer.getAddress();
  const { token, pool } = await deployAll(deployer, ASP_ENFORCE ? { asp: deployerAddr } : {});
  const poolAddr = await pool.getAddress();
  const tokenAddr = await token.getAddress();
  const chainId = Number((await provider.getNetwork()).chainId);

  // DFX-seitige Schlüssel + Buchführung
  const dfx = await Keypair.create();
  const dfxAddr = dfx.address();
  const tree = await new MerkleTree().init();
  const dfxWallet = new ShieldedWallet(dfx, tree, "DFX");
  const abi = loadAbi("ShieldedPool", "ShieldedPool");
  const poolRead = new Contract(poolAddr, abi, provider);
  const poolRelay = new Contract(poolAddr, abi, relayer);
  const poolAsp = new Contract(poolAddr, abi, deployer); // deployer == ASP

  // Vor jeder Tx sicherstellen, dass die im Proof gebundene Association-Root on-chain
  // als gültig registriert ist (idempotent). Der ASP-Good-Set wächst monoton.
  async function ensureAspRoot(root) {
    if (!ASP_ENFORCE || root == null) return;
    if (await poolRead.knownAspRoot(root)) return;
    await (await poolAsp.publishAspRoot(root)).wait();
  }

  const shieldAddrJson = { pubKey: dfxAddr.pubKey.toString(), encPubKey: dfxAddr.encPubKey };
  const quotes = new Map();

  const app = express();
  // CORS: die Web-App (eigener Origin) spricht den Provider/Relayer direkt an.
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "content-type");
    res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });
  app.use(express.json({ limit: "4mb" }));

  app.get("/config", async (_req, res) => {
    let aspRoot = "0";
    try { aspRoot = (await poolRead.aspRoot()).toString(); } catch { /* permissiver Modus */ }
    res.json({
      chainId,
      pool: poolAddr,
      token: tokenAddr,
      merchant,
      dfxShieldAddress: shieldAddrJson,
      relayer: `${BASE}/v1/shielded/submit`,
      shield: `${BASE}/v1/shield`,
      indexer: process.env.INDEXER || "http://127.0.0.1:8789",
      aspEnforced: ASP_ENFORCE,
      aspRoot,
    });
  });

  // KYC/AML-Screening (echt): validiert Felder, prüft Jurisdiktion-Embargo + Sanktionslisten.
  // Kann ABLEHNEN. Dokumenten-/Liveness-Verifikation ist Aufgabe des lizenzierten Providers.
  app.post("/v1/kyc/screen", (req, res) => {
    try {
      const result = screenApplicant(req.body || {});
      res.json(result);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // Fund/Shield — der Provider (Onramp) zahlt öffentlich in den Pool ein und schreibt das
  // Guthaben als verschlüsselte Note der App-Shielded-Address gut. So bleibt die App ein
  // reiner Client (Keys + Proofs); der einzige öffentliche Touchpoint (KYC/Onramp) liegt hier.
  app.post("/v1/shield", async (req, res) => {
    try {
      const { amount, ownerPubKey, encPubKey } = req.body;
      if (!amount || !ownerPubKey || !encPubKey) return res.status(400).json({ error: "amount, ownerPubKey, encPubKey required" });
      const amt = BigInt(amount);
      await syncFromChain(poolRead, tree, [dfxWallet]);
      const note = new Note({ amount: amt, pubKey: BigInt(ownerPubKey) });
      const shield = await buildTransaction({
        tree,
        inputs: [],
        outputs: [{ note, encPubKey }],
        extAmount: amt,
      });
      await (await token.mint(deployerAddr, amount)).wait();
      await (await token.approve(poolAddr, amount)).wait();
      await ensureAspRoot(shield.associationRoot);
      const tx = await poolAsp.transact(
        proofTuple(shield.proof),
        shield.root,
        shield.newRoot,
        shield.associationRoot,
        shield.inputNullifiers,
        shield.outputCommitments,
        extTuple(shield.extData),
      );
      const rc = await tx.wait();
      await syncFromChain(poolRead, tree, [dfxWallet]);
      res.json({ status: "shielded", commitment: shield.outputCommitments[0], txHash: rc.hash });
    } catch (e) {
      res.status(400).json({ error: e.shortMessage || e.message });
    }
  });

  // Schritt 2 — Payment-Details / Quote (mit shielded transferAmounts)
  app.get("/v1/lnurlp/:paymentId", (req, res) => {
    const { paymentId } = req.params;
    let q = quotes.get(paymentId);
    if (!q) {
      q = { paymentId, quoteId: `plq_${paymentId}`, asset: "USDC", method: "Base", amount: "250", status: "pending" };
      quotes.set(paymentId, q);
    }
    res.json({
      tag: "payRequest",
      recipient: { name: "Demo Merchant" },
      quote: { id: q.quoteId, payment: paymentId, expiration: "2026-12-31T00:00:00Z" },
      transferAmounts: [
        {
          method: "Base",
          shielded: true,
          shieldedPool: poolAddr,
          assets: [{ asset: "USDC", amount: q.amount, shielded: true }],
        },
      ],
      callback: `${BASE}/v1/lnurlp/cb/${paymentId}`,
    });
  });

  // Schritt 3 — Tx-Details (Pool-Instruktion)
  app.get("/v1/lnurlp/cb/:paymentId", (req, res) => {
    const q = quotes.get(req.params.paymentId);
    if (!q) return res.status(404).json({ error: "unknown payment" });
    res.json({
      blockchain: "Base",
      shieldedPool: poolAddr,
      token: tokenAddr,
      recipientShieldAddress: shieldAddrJson,
      publicAmount: "0",
      amount: q.amount,
      quoteId: q.quoteId,
      relayers: [`${BASE}/v1/shielded/submit`],
    });
  });

  app.get("/v1/lnurlp/:paymentId/status", (req, res) => {
    const q = quotes.get(req.params.paymentId);
    res.json({ status: q?.status || "unknown", dfxShieldedBalance: dfxWallet.balance().toString() });
  });

  // Schritt 5 — abgeschirmte Tx broadcasten (Relayer zahlt Gas)
  app.post("/v1/shielded/submit", async (req, res) => {
    try {
      const { proof, root, newRoot, associationRoot, inputNullifiers, outputCommitments, extData, quoteId } = req.body;
      await ensureAspRoot(associationRoot);
      const tx = await poolRelay.transact(proofTuple(proof), root, newRoot, associationRoot, inputNullifiers, outputCommitments, extTuple(extData));
      const rc = await tx.wait();
      await syncFromChain(poolRead, tree, [dfxWallet]);
      for (const q of quotes.values()) if (q.quoteId === quoteId) q.status = "paid";
      res.json({ status: "broadcast", txHash: rc.hash, dfxShieldedBalance: dfxWallet.balance().toString() });
    } catch (e) {
      res.status(400).json({ error: e.shortMessage || e.message });
    }
  });

  // Demo — DFX unshieldet die empfangene Note an den Händler (Aggregat-Settlement, hier 1:1)
  app.post("/v1/settle", async (_req, res) => {
    try {
      await syncFromChain(poolRead, tree, [dfxWallet]);
      const note = dfxWallet.spendable()[0];
      if (!note) return res.status(400).json({ error: "no DFX note to settle" });
      const settle = await buildTransaction({
        tree,
        inputs: [{ note: note.note, privateKey: dfx.privateKey, index: note.index }],
        outputs: [],
        extAmount: -note.note.amount,
        recipient: merchant,
      });
      await ensureAspRoot(settle.associationRoot);
      const tx = await poolRelay.transact(
        proofTuple(settle.proof),
        settle.root,
        settle.newRoot,
        settle.associationRoot,
        settle.inputNullifiers,
        settle.outputCommitments,
        extTuple(settle.extData),
      );
      const rc = await tx.wait();
      dfxWallet.markSpent([note.index]);
      const merchantBalance = (await token.balanceOf(merchant)).toString();
      res.json({ status: "settled", txHash: rc.hash, merchantBalance });
    } catch (e) {
      res.status(400).json({ error: e.shortMessage || e.message });
    }
  });

  app.listen(PORT, () => {
    console.log(`Cloister mock provider + relayer on ${BASE}`);
    console.log(`  pool=${poolAddr} token=${tokenAddr} chainId=${chainId}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
