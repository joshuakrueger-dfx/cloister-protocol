import express from "express";
import crypto from "node:crypto";
import { JsonRpcProvider, Contract } from "ethers";
import { deployAll, loadAbi } from "@cloister/contracts/deploy";
import { screenApplicant, loadFullSdn, screeningStatus } from "./kyc.js";
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
const DFX_API = (process.env.DFX_API_BASE || "https://api.dfx.swiss").replace(/\/$/, "");
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
  const kycSecret = process.env.KYC_TOKEN_SECRET || crypto.randomBytes(32).toString("hex");
  const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS || "").split(",").map((x) => x.trim()).filter(Boolean));
  if (ASP_ENFORCE && !process.env.KYC_TOKEN_SECRET) {
    throw new Error("ASP_ENFORCE=1 requires KYC_TOKEN_SECRET; refusing an unauthenticated compliance backend");
  }
  if (ASP_ENFORCE && !allowedOrigins.size) {
    throw new Error("ASP_ENFORCE=1 requires ALLOWED_ORIGINS; refusing wildcard production CORS");
  }
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
  const numLanes = Number(await poolRead.numLanes());

  function badReq(msg) { const e = new Error(msg); e.shortMessage = msg; return e; }

  function issueKycToken(ownerPubKey, payload) {
    const body = Buffer.from(JSON.stringify({
      ownerPubKey: String(ownerPubKey || ""),
      subjectType: payload.subjectType,
      jurisdiction: payload.jurisdiction,
      issuedAt: Date.now(),
      expiresAt: Date.now() + 15 * 60 * 1000,
    })).toString("base64url");
    const sig = crypto.createHmac("sha256", kycSecret).update(body).digest("base64url");
    return `${body}.${sig}`;
  }

  function verifyKycToken(token, ownerPubKey) {
    try {
      const [body, sig] = String(token || "").split(".");
      if (!body || !sig) return false;
      const expected = crypto.createHmac("sha256", kycSecret).update(body).digest("base64url");
      if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
      const claims = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
      return claims.ownerPubKey === String(ownerPubKey) && Number(claims.expiresAt) > Date.now();
    } catch {
      return false;
    }
  }

  // BN254 scalar field — every on-chain root/commitment/nullifier must be a valid element.
  const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
  function isFieldElement(x) {
    try { const v = BigInt(x); return v >= 0n && v < FIELD; } catch { return false; }
  }

  // SERVER-BUILT txs only (shield / settle): DFX *is* the ASP and is legitimately advancing
  // its OWN verified good-set from a transaction it constructed itself, so publishing a
  // not-yet-known root is correct here. The good-set grows monotonically.
  async function publishOwnAspRoot(root) {
    if (!ASP_ENFORCE || root == null) return;
    if (!isFieldElement(root)) throw badReq("invalid associationRoot");
    if (await poolRead.knownAspRoot(root)) return;
    await (await poolAsp.publishAspRoot(root)).wait();
  }

  // CALLER-SUPPLIED txs (/v1/shielded/submit): the bound association root MUST already be a
  // known good-set root the ASP published from its own verified set. We NEVER publish a
  // caller-supplied root — auto-publishing let anyone legitimize a tree of non-vetted
  // commitments and bypass the on-chain compliance gate (finding P1-10).
  async function requireKnownAspRoot(root) {
    if (!ASP_ENFORCE) return;
    if (!isFieldElement(root)) throw badReq("invalid associationRoot");
    if (!(await poolRead.knownAspRoot(root))) {
      throw badReq("associationRoot not in the ASP good-set — payment rejected (compliance gate)");
    }
  }

  const shieldAddrJson = { pubKey: dfxAddr.pubKey.toString(), encPubKey: dfxAddr.encPubKey };
  const quotes = new Map();

  const app = express();
  // CORS: production uses an explicit allowlist; wildcard is only permitted for the local PoC.
  app.use((req, res, next) => {
    const origin = req.get("origin");
    if (allowedOrigins.size) {
      if (origin && allowedOrigins.has(origin)) res.header("Access-Control-Allow-Origin", origin);
      res.header("Vary", "Origin");
    } else {
      res.header("Access-Control-Allow-Origin", "*");
    }
    res.header("Access-Control-Allow-Headers", "content-type");
    res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });
  app.use(express.json({ limit: "4mb" }));

  const hits = new Map();
  app.use((req, res, next) => {
    if (!req.path.startsWith("/v1/")) return next();
    const key = `${req.ip || "unknown"}:${Math.floor(Date.now() / 60_000)}`;
    const count = (hits.get(key) || 0) + 1;
    hits.set(key, count);
    if (count > 120) return res.status(429).json({ error: "rate limited" });
    for (const k of hits.keys()) if (!k.endsWith(`:${Math.floor(Date.now() / 60_000)}`)) hits.delete(k);
    next();
  });

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
      levels: 20,
      numLanes,
      aspEnforced: ASP_ENFORCE,
      aspRoot,
      screening: screeningStatus(),
    });
  });

  // KYC/AML-Screening (echt): validiert Felder, prüft Jurisdiktion-Embargo + Sanktionslisten.
  // Kann ABLEHNEN. Dokumenten-/Liveness-Verifikation ist Aufgabe des lizenzierten Providers;
  // this pre-screen never mints an ASP credential.
  app.post("/v1/kyc/screen", (req, res) => {
    try {
      const result = screenApplicant(req.body || {});
      res.json(result);
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  // Bind the browser's regulated DFX session to the Cloister owner key. The DFX JWT is
  // forwarded only to the configured DFX API; the Cloister server never stores it. The
  // resulting short-lived HMAC token is the only credential accepted by ASP_ENFORCE shield.
  app.post("/v1/kyc/attest/dfx", async (req, res) => {
    try {
      const { ownerPubKey, dfxToken } = req.body || {};
      if (!ownerPubKey || !isFieldElement(ownerPubKey) || !dfxToken || typeof dfxToken !== "string") {
        return res.status(400).json({ error: "ownerPubKey and DFX provider session required" });
      }
      const auth = { Authorization: `Bearer ${dfxToken}` };
      const userResponse = await fetch(`${DFX_API}/v2/user`, { headers: auth });
      if (!userResponse.ok) return res.status(403).json({ error: "DFX provider session rejected" });
      const user = await userResponse.json();
      const kycCode = user?.kyc?.hash;
      if (typeof kycCode !== "string" || !kycCode) return res.status(403).json({ error: "DFX KYC identity binding unavailable" });
      const kycResponse = await fetch(`${DFX_API}/v2/kyc`, { headers: { ...auth, "x-kyc-code": kycCode } });
      if (!kycResponse.ok) return res.status(403).json({ error: "DFX KYC status rejected" });
      const kyc = await kycResponse.json();
      const level = Number(kyc?.kycLevel);
      if (!Number.isInteger(level) || level < 30) return res.status(403).json({ error: "DFX KYC level 30 or higher required" });
      const kycToken = issueKycToken(ownerPubKey, { subjectType: "individual", jurisdiction: "provider-dfx", provider: "dfx", level });
      res.json({ status: "verified", provider: "dfx", level, kycToken });
    } catch {
      // Do not echo provider response bodies or tokens into the Cloister API surface.
      res.status(502).json({ error: "DFX provider attestation unavailable" });
    }
  });

  // Fund/Shield — der Provider (Onramp) zahlt öffentlich in den Pool ein und schreibt das
  // Guthaben als verschlüsselte Note der App-Shielded-Address gut. So bleibt die App ein
  // reiner Client (Keys + Proofs); der einzige öffentliche Touchpoint (KYC/Onramp) liegt hier.
  app.post("/v1/shield", async (req, res) => {
    try {
      const { amount, ownerPubKey, encPubKey, kycToken } = req.body;
      if (!amount || !ownerPubKey || !encPubKey) return res.status(400).json({ error: "amount, ownerPubKey, encPubKey required" });
      if (!isFieldElement(ownerPubKey) || typeof encPubKey !== "string" || !/^[0-9a-f]{64}$/i.test(encPubKey)) {
        return res.status(400).json({ error: "invalid shield recipient key" });
      }
      const amt = BigInt(amount);
      if (amt <= 0n || amt >= 2n ** 248n) return res.status(400).json({ error: "amount out of range" });
      if (ASP_ENFORCE && !verifyKycToken(kycToken, ownerPubKey)) {
        return res.status(403).json({ error: "valid KYC screening token required" });
      }
      await syncFromChain(poolRead, tree, [dfxWallet]);
      const note = new Note({ amount: amt, pubKey: BigInt(ownerPubKey) });
      const shield = await buildTransaction({
        tree,
        chainId,
        poolAddress: poolAddr,
        lane: 0,
        inputs: [],
        outputs: [{ note, encPubKey }],
        extAmount: amt,
      });
      await (await token.mint(deployerAddr, amount)).wait();
      await (await token.approve(poolAddr, amount)).wait();
      await publishOwnAspRoot(shield.associationRoot);
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
      q = { paymentId, quoteId: `plq_${paymentId}`, asset: "USDC", method: "Base", amount: "250", status: "pending", expiresAt: Date.now() + 15 * 60 * 1000 };
      quotes.set(paymentId, q);
    }
    res.json({
      tag: "payRequest",
      recipient: { name: "Demo Merchant" },
      quote: { id: q.quoteId, payment: paymentId, expiration: new Date(q.expiresAt).toISOString() },
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
    if (q.expiresAt <= Date.now()) q.status = "expired";
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
    res.json({ status: q?.status || "unknown", txHash: q?.txHash, dfxShieldedBalance: dfxWallet.balance().toString() });
  });

  // Schritt 5 — abgeschirmte Tx broadcasten (Relayer zahlt Gas)
  app.post("/v1/shielded/submit", async (req, res) => {
    try {
      const { proof, root, newRoot, associationRoot, inputNullifiers, outputCommitments, extData, quoteId } = req.body;
      const lane = Number(req.body?.lane ?? 0);
      if (!Number.isInteger(lane) || lane < 0 || lane >= numLanes) {
        return res.status(400).json({ error: "invalid lane" });
      }
      const quote = quoteId ? [...quotes.values()].find((q) => q.quoteId === quoteId) : null;
      if (quoteId && (!quote || quote.status !== "pending" || quote.expiresAt <= Date.now())) {
        return res.status(409).json({ error: "quote missing, expired, or already settled" });
      }
      const proofShapeValid = Boolean(
        proof && Array.isArray(proof.a) && proof.a.length === 2 &&
        Array.isArray(proof.b) && proof.b.length === 2 && proof.b.every((x) => Array.isArray(x) && x.length === 2) &&
        Array.isArray(proof.c) && proof.c.length === 2
      );
      const proofScalars = proofShapeValid ? [...proof.a, ...proof.b.flat(), ...proof.c] : [];
      // Validate every caller-supplied field element BEFORE touching the chain.
      if (!Array.isArray(inputNullifiers) || inputNullifiers.length !== 2 ||
          !Array.isArray(outputCommitments) || outputCommitments.length !== 2 ||
          !proofShapeValid || !proofScalars.every(isFieldElement) ||
          !extData || typeof extData !== "object" ||
          typeof extData.recipient !== "string" || typeof extData.relayer !== "string" ||
          typeof extData.encryptedOutput1 !== "string" || typeof extData.encryptedOutput2 !== "string" ||
          ![root, newRoot, associationRoot, ...inputNullifiers, ...outputCommitments].every(isFieldElement)) {
        return res.status(400).json({ error: "invalid transaction fields" });
      }
      // Bind the quote to the exact shielded output. The relayer owns the DFX viewing key, so it
      // can decrypt only the quoted recipient memo and compare its recomputed commitment. A proof
      // for a different amount/recipient can no longer mark an unrelated quote as paid.
      if (quote && (BigInt(extData.extAmount) !== 0n || BigInt(extData.fee || 0) !== 0n)) {
        return res.status(400).json({ error: "quote requires a zero-public-amount transfer" });
      }
      let expectedRecipientCommitment = null;
      if (quote) {
        const recipientNote = [extData.encryptedOutput1, extData.encryptedOutput2]
          .map((enc) => Note.tryDecrypt(enc, dfx.enc.secretKey))
          .find((n) => n && n.amount === BigInt(quote.amount));
        if (!recipientNote) return res.status(400).json({ error: "quoted recipient output not found" });
        expectedRecipientCommitment = await new Note({ amount: recipientNote.amount, pubKey: dfx.publicKey, blinding: recipientNote.blinding }).commitment();
        if (!outputCommitments.some((c) => BigInt(c) === expectedRecipientCommitment)) {
          return res.status(400).json({ error: "quote/output commitment mismatch" });
        }
      }
      // Compliance gate: reject unless the bound root is an ALREADY-KNOWN good-set root.
      // Never auto-publish a caller-supplied root (P1-10).
      await requireKnownAspRoot(associationRoot);
      const tx = lane === 0
        ? await poolRelay.transact(proofTuple(proof), root, newRoot, associationRoot, inputNullifiers, outputCommitments, extTuple(extData))
        : await poolRelay.transactLane(lane, proofTuple(proof), root, newRoot, associationRoot, inputNullifiers, outputCommitments, extTuple(extData));
      const rc = await tx.wait();
      await syncFromChain(poolRead, tree, [dfxWallet]);
      // Only settle a quote that actually exists and was pending — bind status to a real quote.
      if (quote) {
        quote.status = "paid";
        quote.txHash = rc.hash;
        quote.outputCommitment = expectedRecipientCommitment.toString();
      }
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
        chainId,
        poolAddress: poolAddr,
        lane: 0,
        inputs: [{ note: note.note, privateKey: dfx.privateKey, index: note.index }],
        outputs: [],
        extAmount: -note.note.amount,
        recipient: merchant,
      });
      await publishOwnAspRoot(settle.associationRoot);
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
      dfxWallet.markSpent([note.index], note.lane);
      const merchantBalance = (await token.balanceOf(merchant)).toString();
      res.json({ status: "settled", txHash: rc.hash, merchantBalance });
    } catch (e) {
      res.status(400).json({ error: e.shortMessage || e.message });
    }
  });

  // Load the full sanctions lists (OFAC SDN + alt + optional EU) before exposing an ASP
  // provider. A degraded sample-only screen is acceptable for the PoC, never for an enforced
  // compliance backend.
  const initialScreening = await loadFullSdn().catch((e) => {
    console.warn(`sanctions load failed (staying on sample): ${e.message}`);
    return screeningStatus();
  });
  console.log(`sanctions screening: ${initialScreening.mode} · ${initialScreening.count} names · ${initialScreening.source}`);
  if (ASP_ENFORCE && initialScreening.mode !== "full") {
    throw new Error("ASP_ENFORCE=1 requires full sanctions data; refusing degraded sample-only screening");
  }
  setInterval(() => { loadFullSdn().catch(() => {}); }, 24 * 60 * 60 * 1000).unref?.();

  app.listen(PORT, () => {
    console.log(`Cloister mock provider + relayer on ${BASE}`);
    console.log(`  pool=${poolAddr} token=${tokenAddr} chainId=${chainId}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
