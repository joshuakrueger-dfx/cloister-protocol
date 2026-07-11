const { expect } = require("chai");
const { ethers } = require("hardhat");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { AbiCoder, keccak256, ZeroAddress } = require("ethers");

// End-to-end: a REAL gnark Groth16 proof drives an actual ShieldedPool deposit.
// The proof, roots, nullifiers, commitments and extData all come from the gnark
// prover (test/gen-transact-fixture.js); the pool is deployed with the Poseidon2
// empty-tree root as its initial root so oldRoot matches.
//
// WP-A1 domain separation: extDataHash is bound to chain, lane and the concrete deployment
// address. A committed proof cannot be reused for a freshly deployed pool, so the E2E suite
// generates its proof after each pool address is known. The committed fixture remains a
// verifier smoke-test artifact; it is deliberately not used as a live-pool proof.
const staticFx = JSON.parse(fs.readFileSync(path.join(__dirname, "testdata", "transact.json"), "utf8"));
const FIELD_SIZE = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const EXT_DATA_ABI = "tuple(address recipient,int256 extAmount,address relayer,uint256 fee,bytes encryptedOutput1,bytes encryptedOutput2)";
const AMOUNT = 1_000_000n;
const PROVER_DIR = path.join(__dirname, "..", "..", "prover-gnark");
let keysReady = false;
const fixtureCache = new Map();

async function deployDynamicVerifier() {
  const Implementation = await ethers.getContractFactory("DynamicGroth16Verifier");
  const implementation = await Implementation.deploy();
  const Delegate = await ethers.getContractFactory("TransactionVerifierDelegate");
  return Delegate.deploy(await implementation.getAddress());
}

function ensureKeys() {
  if (keysReady) return;
  const pk = path.join(PROVER_DIR, "keys", "pk.bin");
  if (!fs.existsSync(pk)) {
    execFileSync("go", ["run", "./cmd/setup", "."], { cwd: PROVER_DIR, stdio: "inherit" });
  }
  keysReady = true;
}

function goAvailable() {
  try {
    execFileSync("go", ["version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function fixtureForPool(poolAddress) {
  const key = poolAddress.toLowerCase();
  if (fixtureCache.has(key)) return fixtureCache.get(key);
  ensureKeys();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cloister-transact-"));
  const scenarioPath = path.join(dir, "scenario.json");
  const outPath = path.join(dir, "transact.json");
  const extData = {
    recipient: ZeroAddress,
    extAmount: AMOUNT.toString(),
    relayer: ZeroAddress,
    fee: "0",
    encryptedOutput1: "0x",
    encryptedOutput2: "0x",
  };
  const encoded = AbiCoder.defaultAbiCoder().encode(
    [EXT_DATA_ABI, "uint256", "uint256", "address"],
    [[extData.recipient, extData.extAmount, extData.relayer, extData.fee, extData.encryptedOutput1, extData.encryptedOutput2], 31337n, 0n, poolAddress],
  );
  const extDataHash = (BigInt(keccak256(encoded)) % FIELD_SIZE).toString();
  fs.writeFileSync(scenarioPath, JSON.stringify({ amount: AMOUNT.toString(), extDataHash }));
  execFileSync("go", ["run", "./cmd/emitscenario", "./keys", scenarioPath, outPath], { cwd: PROVER_DIR, stdio: "inherit" });
  const fx = JSON.parse(fs.readFileSync(outPath, "utf8"));
  fx.extData = extData;
  fx.amount = AMOUNT.toString();
  fixtureCache.set(key, fx);
  return fx;
}

const LEVELS = 20;
const LANES = 8;

describe("ShieldedPool — real-proof deposit (gnark E2E)", function () {
  let pool, token, owner, fx;

  before(async function () {
    if (!goAvailable()) this.skip();
    [owner] = await ethers.getSigners();

    const verifier = await deployDynamicVerifier();
    token = await (await ethers.getContractFactory("MockERC20")).deploy("USD Coin", "USDC", 6);

    const Pool = await ethers.getContractFactory("ShieldedPool");
    // initialRoot = the Poseidon2 empty-tree root from the prover's empty tree.
    pool = await Pool.deploy(
      LEVELS, LANES, BigInt(staticFx.oldRoot),
      await verifier.getAddress(), await token.getAddress(),
      owner.address, ethers.ZeroAddress, 0n, // asp=0 → permissive dev mode
    );
    fx = fixtureForPool(await pool.getAddress());

    await token.mint(owner.address, BigInt(fx.amount));
    await token.approve(await pool.getAddress(), BigInt(fx.amount));
  });

  it("deposits via transact with a genuine proof and updates state", async function () {
    const proof = { a: fx.a, b: fx.b, c: fx.c };
    const ed = fx.extData;
    const extData = [ed.recipient, ed.extAmount, ed.relayer, ed.fee, ed.encryptedOutput1, ed.encryptedOutput2];

    await expect(
      pool.transact(
        proof,
        BigInt(fx.oldRoot),
        BigInt(fx.newRoot),
        BigInt(fx.associationRoot),
        [BigInt(fx.nullifiers[0]), BigInt(fx.nullifiers[1])],
        [BigInt(fx.commitments[0]), BigInt(fx.commitments[1])],
        extData,
      ),
    ).to.emit(pool, "NewCommitment");

    // pool now holds the deposited tokens and advanced to the new root
    expect(await token.balanceOf(await pool.getAddress())).to.equal(BigInt(fx.amount));
    expect(await pool.laneRoot(0)).to.equal(BigInt(fx.newRoot));
    expect(await pool.nullifierSpent(BigInt(fx.nullifiers[0]))).to.equal(true);
  });

  it("rejects tampered extData — the on-chain keccak binding is airtight (no malleability)", async function () {
    // Fresh pool so oldRoot is still valid; the proof binds extDataHash for the ORIGINAL
    // extData. We submit the SAME proof but mutate a hash-only field (encryptedOutput1) that
    // does NOT change publicAmount. The contract recomputes the domain-bound hash from the
    // tampered extData + deployment context → pub[2] no longer matches the proof → verifyProof fails.
    // This proves a relayer/MEV actor cannot swap recipient/relayer/fee/outputs of a valid proof.
    const verifier = await deployDynamicVerifier();
    const tok = await (await ethers.getContractFactory("MockERC20")).deploy("USD Coin", "USDC", 6);
    const Pool = await ethers.getContractFactory("ShieldedPool");
    const freshPool = await Pool.deploy(
      LEVELS, LANES, BigInt(staticFx.oldRoot), await verifier.getAddress(), await tok.getAddress(),
      owner.address, ethers.ZeroAddress, 0n,
    );
    const localFx = fixtureForPool(await freshPool.getAddress());
    await tok.mint(owner.address, BigInt(localFx.amount));
    await tok.approve(await freshPool.getAddress(), BigInt(localFx.amount));

    const proof = { a: localFx.a, b: localFx.b, c: localFx.c };
    const ed = localFx.extData;
    const tampered = [ed.recipient, ed.extAmount, ed.relayer, ed.fee, "0xdeadbeef", ed.encryptedOutput2];
    await expect(
      freshPool.transact(
        proof, BigInt(localFx.oldRoot), BigInt(localFx.newRoot), BigInt(localFx.associationRoot),
        [BigInt(localFx.nullifiers[0]), BigInt(localFx.nullifiers[1])],
        [BigInt(localFx.commitments[0]), BigInt(localFx.commitments[1])],
        tampered,
      ),
    ).to.be.revertedWith("invalid proof");
  });

  it("rejects a replay of the same nullifiers", async function () {
    const proof = { a: fx.a, b: fx.b, c: fx.c };
    const ed = fx.extData;
    const extData = [ed.recipient, ed.extAmount, ed.relayer, ed.fee, ed.encryptedOutput1, ed.encryptedOutput2];
    await expect(
      pool.transact(
        proof, BigInt(fx.newRoot), BigInt(fx.newRoot), BigInt(fx.associationRoot),
        [BigInt(fx.nullifiers[0]), BigInt(fx.nullifiers[1])],
        [BigInt(fx.commitments[0]), BigInt(fx.commitments[1])],
        extData,
      ),
    ).to.be.reverted; // stale root / spent nullifier
  });

  it("rejects replaying a lane-0 proof into another lane (WP-A1 lane binding)", async function () {
    // The fixture proof is a lane-0 deposit; its extDataHash binds lane 0. Submitting the SAME
    // proof via transactLane(1) makes the contract recompute the domain hash with lane 1 — a
    // different public input than the proof bound → verifyProof rejects it. This closes
    // the lane front-run griefing vector (a valid proof for one lane cannot be pushed into
    // another lane sharing the same genesis root).
    const verifier = await deployDynamicVerifier();
    const tok = await (await ethers.getContractFactory("MockERC20")).deploy("USD Coin", "USDC", 6);
    const Pool = await ethers.getContractFactory("ShieldedPool");
    const p = await Pool.deploy(
      LEVELS, LANES, BigInt(staticFx.oldRoot), await verifier.getAddress(), await tok.getAddress(),
      owner.address, ethers.ZeroAddress, 0n,
    );
    const localFx = fixtureForPool(await p.getAddress());
    await tok.mint(owner.address, BigInt(localFx.amount));
    await tok.approve(await p.getAddress(), BigInt(localFx.amount));

    const proof = { a: localFx.a, b: localFx.b, c: localFx.c };
    const ed = localFx.extData;
    const extData = [ed.recipient, ed.extAmount, ed.relayer, ed.fee, ed.encryptedOutput1, ed.encryptedOutput2];
    await expect(
      p.transactLane(
        1n, proof, BigInt(localFx.oldRoot), BigInt(localFx.newRoot), BigInt(localFx.associationRoot),
        [BigInt(localFx.nullifiers[0]), BigInt(localFx.nullifiers[1])],
        [BigInt(localFx.commitments[0]), BigInt(localFx.commitments[1])],
        extData,
      ),
    ).to.be.revertedWith("invalid proof");
  });
});

// Real-verifier negative paths: the same genuine proof, submitted with ONE public input
// tampered, MUST be rejected by the actual Groth16 verifier inside _transact. These signals
// (nullifiers, commitments, newRoot, associationRoot) pass the pre-verify requires in
// permissive dev mode, so the ONLY thing that can reject them is verifyProof — proving the
// verifier is wired correctly and is the real gate (not the always-true MockVerifier).
describe("ShieldedPool — real verifier rejects tampered public inputs (gnark E2E)", function () {
  const LEVELS = 20;
  const LANES = 8;
  let owner, pool, fx;

  before(async function () {
    if (!goAvailable()) this.skip();
    [owner] = await ethers.getSigners();
    const verifier = await deployDynamicVerifier();
    const tok = await (await ethers.getContractFactory("MockERC20")).deploy("USD Coin", "USDC", 6);
    const Pool = await ethers.getContractFactory("ShieldedPool");
    pool = await Pool.deploy(
      LEVELS, LANES, BigInt(staticFx.oldRoot), await verifier.getAddress(), await tok.getAddress(),
      owner.address, ethers.ZeroAddress, 0n,
    );
    fx = fixtureForPool(await pool.getAddress());
    await tok.mint(owner.address, BigInt(fx.amount));
    await tok.approve(await pool.getAddress(), BigInt(fx.amount));
  });

  const ed = () => {
    const e = fx.extData;
    return [e.recipient, e.extAmount, e.relayer, e.fee, e.encryptedOutput1, e.encryptedOutput2];
  };
  const proof = () => ({ a: fx.a, b: fx.b, c: fx.c });
  const BUMP = (h) => "0x" + (BigInt(h) + 1n).toString(16); // shift a signal by 1 → proof no longer matches

  const cases = [
    { name: "tampered input nullifier", make: (f) => ({ nf: [BUMP(f.nullifiers[0]), BigInt(f.nullifiers[1])], cm: [BigInt(f.commitments[0]), BigInt(f.commitments[1])], nr: BigInt(f.newRoot), ar: BigInt(f.associationRoot) }) },
    { name: "tampered output commitment", make: (f) => ({ nf: [BigInt(f.nullifiers[0]), BigInt(f.nullifiers[1])], cm: [BUMP(f.commitments[0]), BigInt(f.commitments[1])], nr: BigInt(f.newRoot), ar: BigInt(f.associationRoot) }) },
    { name: "tampered newRoot", make: (f) => ({ nf: [BigInt(f.nullifiers[0]), BigInt(f.nullifiers[1])], cm: [BigInt(f.commitments[0]), BigInt(f.commitments[1])], nr: BUMP(f.newRoot), ar: BigInt(f.associationRoot) }) },
    { name: "tampered associationRoot", make: (f) => ({ nf: [BigInt(f.nullifiers[0]), BigInt(f.nullifiers[1])], cm: [BigInt(f.commitments[0]), BigInt(f.commitments[1])], nr: BigInt(f.newRoot), ar: BUMP(f.associationRoot) }) },
  ];

  for (const c of cases) {
    it(`rejects ${c.name} via verifyProof`, async function () {
      const args = c.make(fx);
      await expect(
        pool.transact(proof(), BigInt(fx.oldRoot), args.nr, args.ar, args.nf, args.cm, ed()),
      ).to.be.revertedWith("invalid proof");
    });
  }
});
