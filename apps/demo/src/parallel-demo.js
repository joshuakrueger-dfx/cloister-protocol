import { JsonRpcProvider, Contract } from "ethers";
import { deployAll } from "@cloister/contracts/deploy";
import { Keypair, Note, MerkleTree, ShieldedWallet, buildTransaction, artifactPaths, MERKLE_LEVELS } from "@cloister/sdk";

const RPC = process.env.RPC || "http://127.0.0.1:8545";
const { wasmPath, zkeyPath } = artifactPaths();
const STRIDE = 1n << BigInt(MERKLE_LEVELS);
const GAS = 800000; // explizites Limit → Txs landen im Block (in-block revert statt estimateGas-Reject)
const log = (...a) => console.log(...a);

const proofTuple = (p) => [p.a, p.b, p.c];
const extTuple = (e) => [e.recipient, e.extAmount, e.relayer, e.fee, e.encryptedOutput1, e.encryptedOutput2];

// NewCommitment-Events nach Lane routen (globalIndex = lane*STRIDE + local)
async function applyReceipt(rc, pool, laneTrees, wallets) {
  const evs = [];
  for (const lg of rc.logs) {
    let p;
    try { p = pool.interface.parseLog(lg); } catch { continue; }
    if (p?.name === "NewCommitment") {
      const g = BigInt(p.args[1]);
      evs.push({ c: p.args[0], lane: Number(g / STRIDE), local: Number(g % STRIDE), enc: p.args[2] });
    }
  }
  evs.sort((a, b) => a.lane - b.lane || a.local - b.local);
  for (const e of evs) {
    laneTrees[e.lane].insert(e.c);
    for (const w of wallets) await w.tryAdd(e.c, e.local, e.enc, e.lane);
  }
}

async function shieldInto(pool, funder, lane, alice, laneTrees, amount) {
  const t = await buildTransaction({
    tree: laneTrees[lane], lane,
    inputs: [], outputs: [{ note: new Note({ amount: BigInt(amount), pubKey: alice.publicKey }), encPubKey: alice.address().encPubKey }],
    extAmount: BigInt(amount), wasmPath, zkeyPath,
  });
  const rc = await (await pool.connect(funder).transactLane(lane, proofTuple(t.proof), t.root, t.newRoot, t.inputNullifiers, t.outputCommitments, extTuple(t.extData))).wait();
  return rc;
}

// baut einen Pay-Proof in `lane` (spend note → 2 Outputs an alice), ohne zu senden
async function buildPay(laneTrees, lane, alice, noteEntry) {
  return buildTransaction({
    tree: laneTrees[lane], lane,
    inputs: [{ note: noteEntry.note, privateKey: alice.privateKey, index: noteEntry.index }],
    outputs: [
      { note: new Note({ amount: 100n, pubKey: alice.publicKey }), encPubKey: alice.address().encPubKey },
      { note: new Note({ amount: noteEntry.note.amount - 100n, pubKey: alice.publicKey }), encPubKey: alice.address().encPubKey },
    ],
    extAmount: 0n, wasmPath, zkeyPath,
  });
}

// sendet vorgebaute Txs gemeinsam in EINEN Block (automine aus) und zählt Erfolge
async function submitInOneBlock(provider, pool, relayer, built) {
  await provider.send("evm_setAutomine", [false]);
  const responses = [];
  for (const t of built) {
    const r = await pool.connect(relayer).transactLane(t.lane, proofTuple(t.proof), t.root, t.newRoot, t.inputNullifiers, t.outputCommitments, extTuple(t.extData), { gasLimit: GAS });
    responses.push(r);
  }
  await provider.send("evm_mine", []);
  await provider.send("evm_setAutomine", [true]);
  let ok = 0, reverted = 0, block = null;
  const receipts = [];
  for (const r of responses) {
    try { const rc = await r.wait(); ok++; block = Number(rc.blockNumber); receipts.push(rc); }
    catch { reverted++; }
  }
  return { ok, reverted, block, receipts };
}

async function main() {
  const provider = new JsonRpcProvider(RPC);
  const funder = await provider.getSigner(0);
  const relayer = await provider.getSigner(1);
  const M = 6; // parallele Lanes

  log("\n=== Cloister: Lane-Parallelisierer ===\n");
  const { token, pool, numLanes } = await deployAll(funder);
  log(`Pool deployed mit ${numLanes} Lanes.`);

  const alice = await Keypair.create();
  const aliceW = new ShieldedWallet(alice, null, "Alice");
  const laneTrees = [];
  for (let i = 0; i < numLanes; i++) laneTrees.push(await new MerkleTree().init());

  await (await token.mint(await funder.getAddress(), 1_000_000)).wait();
  await (await token.connect(funder).approve(await pool.getAddress(), 1_000_000)).wait();

  // Setup: je 1 Note in Lanes 0..M-1 (für Parallel-Test) + M Notes in Lane 0 (für Serial-Test)
  log(`[setup] shielde ${M} Notes über ${M} Lanes + ${M} Notes in Lane 0…`);
  for (let i = 0; i < M; i++) await applyReceipt(await shieldInto(pool, funder, i, alice, laneTrees, 1000), pool, laneTrees, [aliceW]);
  for (let i = 0; i < M; i++) await applyReceipt(await shieldInto(pool, funder, 0, alice, laneTrees, 1000), pool, laneTrees, [aliceW]);

  const byLane = (l) => aliceW.spendable().filter((n) => n.lane === l);

  // ---------- Parallel-Test: M Zahlungen über M Lanes ----------
  log(`\n[parallel] baue ${M} Pay-Proofs in ${M} verschiedenen Lanes und sende sie in EINEN Block…`);
  const parBuilt = [];
  for (let l = 0; l < M; l++) parBuilt.push(await buildPay(laneTrees, l, alice, byLane(l)[0]));
  const par = await submitInOneBlock(provider, pool, relayer, parBuilt);
  log(`           → ${par.ok}/${M} gelandet, ${par.reverted} revertiert  (alle in Block ${par.block})`);
  for (const rc of par.receipts) await applyReceipt(rc, pool, laneTrees, [aliceW]);

  // ---------- Serial-Test: M Zahlungen in DERSELBEN Lane (Lane 0) ----------
  log(`\n[serial]   baue ${M} Pay-Proofs in derselben Lane 0 (gleicher oldRoot) und sende sie in EINEN Block…`);
  const lane0Notes = byLane(0); // verbleibende Lane-0-Notes
  const serBuilt = [];
  for (let k = 0; k < M && k < lane0Notes.length; k++) serBuilt.push(await buildPay(laneTrees, 0, alice, lane0Notes[k]));
  const ser = await submitInOneBlock(provider, pool, relayer, serBuilt);
  log(`           → ${ser.ok}/${serBuilt.length} gelandet, ${ser.reverted} revertiert  (gleiche Lane serialisiert)`);

  const ok = par.ok === M && ser.ok === 1;
  log("\n=== Ergebnis ===");
  log(`  Parallel (verschiedene Lanes): ${par.ok}/${M} landen gemeinsam  ${par.ok === M ? "✅" : "❌"}`);
  log(`  Seriell  (gleiche Lane):       nur ${ser.ok} landet, Rest revertiert  ${ser.ok === 1 ? "✅" : "❌"}`);
  log(ok ? "\n✅ Parallelisierer funktioniert: Durchsatz skaliert mit der Lane-Zahl." : "\n❌ Parallelisierung fehlgeschlagen.");
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
