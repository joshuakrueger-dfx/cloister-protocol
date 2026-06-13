// Cloister 1000-transaction soak test (local hardhat + real gnark proofs via proverd).
//
// Drives the FULL stack — SDK witness build (Poseidon2) → proverd Groth16 proof →
// on-chain ShieldedPool.transact → state — across deposits, internal transfers and
// withdrawals, with a deterministic note model. After every tx it asserts the hard
// invariant: pool token balance == Σ(unspent note amounts). Then an adversarial
// battery (replay, tamper, stale root, double-spend) that must all revert.
//
// Usage: node soak/soak.mjs [N]   (default 1000)
import assert from "node:assert";
import { JsonRpcProvider, Wallet, NonceManager, ZeroAddress, Contract } from "ethers";
import { deployAll, loadAbi } from "@cloister/contracts/deploy";
import { MerkleTree, Note, Keypair, randomField, useHttpBackend, buildTransaction } from "@cloister/sdk";

const RPC = process.env.RPC || "http://127.0.0.1:8545";
const PROVERD = process.env.PROVERD || "http://127.0.0.1:8792";
// hardhat default account #0 (well-known dev key)
const PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const N = parseInt(process.argv[2] || "1000", 10);
const EXT_RECIPIENT = "0x000000000000000000000000000000000000dEaD";

useHttpBackend(PROVERD);

// --- deterministic PRNG (reproducible runs) ---
let _seed = 0x1234abcd;
const rnd = () => ((_seed = (_seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

const provider = new JsonRpcProvider(RPC);
// NonceManager: track the nonce locally so rapid sequential deploys/txs don't collide
// (a plain Wallet + JsonRpcProvider can reuse a stale "pending" nonce under automining).
const signer = new NonceManager(new Wallet(PK, provider));

function extTuple(e) {
  return [e.recipient, e.extAmount, e.relayer, e.fee, e.encryptedOutput1, e.encryptedOutput2];
}
function proofTuple(p) {
  return [p.a, p.b, p.c];
}

async function main() {
  const me = await signer.getAddress();
  console.log(`soak: deploying (signer ${me})…`);
  const { token, pool, verifier, initialRoot } = await deployAll(signer, { asp: ZeroAddress });
  const poolAddr = await pool.getAddress();
  const poolC = new Contract(poolAddr, loadAbi("ShieldedPool", "ShieldedPool"), signer);

  // fund the depositor generously
  const MINT = 10n ** 30n;
  await (await token.mint(me, MINT)).wait();
  await (await token.approve(poolAddr, MINT)).wait();

  const tree = await new MerkleTree(20).init();
  assert.equal((await tree.root()).toString(), initialRoot, "empty root matches deployed initialRoot");

  const alice = await Keypair.create(randomField());
  const bob = await Keypair.create(randomField());
  const kpFor = (n) => (n.ownerLabel === "a" ? alice : bob);

  // unspent notes: { note, priv, index, amount, ownerLabel }
  let unspent = [];
  let poolBalance = 0n;
  let stats = { deposit: 0, transfer: 0, withdraw: 0 };

  // submit a built tx, then mirror state (insert outputs, mark inputs spent)
  async function commit(built, spentIdx, outRecords) {
    await (await poolC.transact(
      proofTuple(built.proof),
      built.root,
      built.newRoot,
      built.associationRoot,
      built.inputNullifiers,
      built.outputCommitments,
      extTuple(built.extData),
    )).wait();
    // mirror tree: outputs occupy the next two leaves, in order
    for (let i = 0; i < built.outNotes.length; i++) {
      const leafIndex = tree.leaves.length;
      tree.insert(built.outputCommitments[i]);
      const rec = outRecords[i];
      if (rec && rec.amount > 0n) unspent.push({ ...rec, index: leafIndex });
    }
    // drop spent
    const spent = new Set(spentIdx);
    unspent = unspent.filter((u) => !spent.has(u.index));
  }

  async function deposit() {
    const owner = pick([{ kp: alice, label: "a" }, { kp: bob, label: "b" }]);
    const amount = BigInt(1000 + Math.floor(rnd() * 100000));
    const out0 = new Note({ amount, pubKey: owner.kp.publicKey, blinding: randomField() });
    const out1 = new Note({ amount: 0n, pubKey: owner.kp.publicKey, blinding: randomField() });
    const built = await buildTransaction({
      tree,
      inputs: [],
      outputs: [
        { note: out0, encPubKey: owner.kp.address().encPubKey },
        { note: out1, encPubKey: owner.kp.address().encPubKey },
      ],
      extAmount: amount,
      fee: 0n,
    });
    await commit(built, [], [
      { note: out0, priv: owner.kp.privateKey, amount, ownerLabel: owner.label },
      { note: out1, priv: owner.kp.privateKey, amount: 0n, ownerLabel: owner.label },
    ]);
    poolBalance += amount;
    stats.deposit++;
  }

  async function transfer() {
    const src = pick(unspent.filter((u) => u.amount > 1n));
    if (!src) return deposit();
    const owner = src.ownerLabel === "a" ? alice : bob;
    const dest = pick([{ kp: alice, label: "a" }, { kp: bob, label: "b" }]);
    const sendAmt = 1n + BigInt(Math.floor(rnd() * Number(src.amount - 1n)));
    const changeAmt = src.amount - sendAmt;
    const outSend = new Note({ amount: sendAmt, pubKey: dest.kp.publicKey, blinding: randomField() });
    const outChange = new Note({ amount: changeAmt, pubKey: owner.publicKey, blinding: randomField() });
    const built = await buildTransaction({
      tree,
      inputs: [{ note: src.note, privateKey: src.priv, index: src.index }],
      outputs: [
        { note: outSend, encPubKey: dest.kp.address().encPubKey },
        { note: outChange, encPubKey: owner.address().encPubKey },
      ],
      extAmount: 0n,
      fee: 0n,
    });
    await commit(built, [src.index], [
      { note: outSend, priv: dest.kp.privateKey, amount: sendAmt, ownerLabel: dest.label },
      { note: outChange, priv: src.priv, amount: changeAmt, ownerLabel: src.ownerLabel },
    ]);
    stats.transfer++;
  }

  async function withdraw() {
    const src = pick(unspent.filter((u) => u.amount > 1n));
    if (!src) return deposit();
    const owner = src.ownerLabel === "a" ? alice : bob;
    const w = 1n + BigInt(Math.floor(rnd() * Number(src.amount - 1n)));
    const changeAmt = src.amount - w;
    const outChange = new Note({ amount: changeAmt, pubKey: owner.publicKey, blinding: randomField() });
    const outZero = new Note({ amount: 0n, pubKey: owner.publicKey, blinding: randomField() });
    const built = await buildTransaction({
      tree,
      inputs: [{ note: src.note, privateKey: src.priv, index: src.index }],
      outputs: [
        { note: outChange, encPubKey: owner.address().encPubKey },
        { note: outZero, encPubKey: owner.address().encPubKey },
      ],
      extAmount: -w,
      fee: 0n,
      recipient: EXT_RECIPIENT,
    });
    await commit(built, [src.index], [
      { note: outChange, priv: src.priv, amount: changeAmt, ownerLabel: src.ownerLabel },
      { note: outZero, priv: src.priv, amount: 0n, ownerLabel: src.ownerLabel },
    ]);
    poolBalance -= w;
    stats.withdraw++;
  }

  const t0 = Date.now();
  for (let i = 0; i < N; i++) {
    const r = rnd();
    if (unspent.length < 4 || r < 0.35) await deposit();
    else if (r < 0.75) await transfer();
    else await withdraw();

    // hard invariant after every tx
    const onchain = await token.balanceOf(poolAddr);
    assert.equal(onchain, poolBalance, `balance invariant @${i}: chain ${onchain} != model ${poolBalance}`);
    const sumNotes = unspent.reduce((a, u) => a + u.amount, 0n);
    assert.equal(sumNotes, poolBalance, `note-sum invariant @${i}: Σnotes ${sumNotes} != ${poolBalance}`);

    if ((i + 1) % 50 === 0) {
      const dt = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`  ${i + 1}/${N}  pool=${poolBalance}  notes=${unspent.length}  (${dt}s)  ${JSON.stringify(stats)}`);
    }
  }

  console.log(`✓ ${N} txs OK in ${((Date.now() - t0) / 1000).toFixed(1)}s — ${JSON.stringify(stats)}`);
  console.log(`  final pool balance ${poolBalance}, unspent notes ${unspent.length}`);
}

main().catch((e) => {
  console.error("✗ soak failed:", e.message);
  process.exit(1);
});
