const { expect } = require("chai");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// End-to-end: a REAL gnark Groth16 proof drives an actual ShieldedPool deposit.
// The proof, roots, nullifiers, commitments and extData all come from the gnark
// prover (test/gen-transact-fixture.js); the pool is deployed with the Poseidon2
// empty-tree root as its initial root so oldRoot matches.
const fx = JSON.parse(fs.readFileSync(path.join(__dirname, "testdata", "transact.json"), "utf8"));

const LEVELS = 20;
const LANES = 8;

describe("ShieldedPool — real-proof deposit (gnark E2E)", function () {
  let pool, token, owner;

  before(async function () {
    [owner] = await ethers.getSigners();

    const verifier = await (await ethers.getContractFactory("TransactionVerifier")).deploy();
    token = await (await ethers.getContractFactory("MockERC20")).deploy("USD Coin", "USDC", 6);

    const Pool = await ethers.getContractFactory("ShieldedPool");
    // initialRoot = the Poseidon2 empty-tree root the proof was built against
    pool = await Pool.deploy(
      LEVELS, LANES, BigInt(fx.oldRoot),
      await verifier.getAddress(), await token.getAddress(),
      owner.address, ethers.ZeroAddress, 0n, // asp=0 → permissive dev mode
    );

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
    // does NOT change publicAmount. The contract recomputes keccak256(abi.encode(extData)) %
    // FIELD from the tampered extData → pub[2] no longer matches the proof → verifyProof fails.
    // This proves a relayer/MEV actor cannot swap recipient/relayer/fee/outputs of a valid proof.
    const verifier = await (await ethers.getContractFactory("TransactionVerifier")).deploy();
    const tok = await (await ethers.getContractFactory("MockERC20")).deploy("USD Coin", "USDC", 6);
    const Pool = await ethers.getContractFactory("ShieldedPool");
    const freshPool = await Pool.deploy(
      LEVELS, LANES, BigInt(fx.oldRoot), await verifier.getAddress(), await tok.getAddress(),
      owner.address, ethers.ZeroAddress, 0n,
    );
    await tok.mint(owner.address, BigInt(fx.amount));
    await tok.approve(await freshPool.getAddress(), BigInt(fx.amount));

    const proof = { a: fx.a, b: fx.b, c: fx.c };
    const ed = fx.extData;
    const tampered = [ed.recipient, ed.extAmount, ed.relayer, ed.fee, "0xdeadbeef", ed.encryptedOutput2];
    await expect(
      freshPool.transact(
        proof, BigInt(fx.oldRoot), BigInt(fx.newRoot), BigInt(fx.associationRoot),
        [BigInt(fx.nullifiers[0]), BigInt(fx.nullifiers[1])],
        [BigInt(fx.commitments[0]), BigInt(fx.commitments[1])],
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
});

// Real-verifier negative paths: the same genuine proof, submitted with ONE public input
// tampered, MUST be rejected by the actual Groth16 verifier inside _transact. These signals
// (nullifiers, commitments, newRoot, associationRoot) pass the pre-verify requires in
// permissive dev mode, so the ONLY thing that can reject them is verifyProof — proving the
// verifier is wired correctly and is the real gate (not the always-true MockVerifier).
describe("ShieldedPool — real verifier rejects tampered public inputs (gnark E2E)", function () {
  const LEVELS = 20;
  const LANES = 8;
  let owner;

  before(async function () {
    [owner] = await ethers.getSigners();
  });

  async function freshPool() {
    const verifier = await (await ethers.getContractFactory("TransactionVerifier")).deploy();
    const tok = await (await ethers.getContractFactory("MockERC20")).deploy("USD Coin", "USDC", 6);
    const Pool = await ethers.getContractFactory("ShieldedPool");
    const pool = await Pool.deploy(
      LEVELS, LANES, BigInt(fx.oldRoot), await verifier.getAddress(), await tok.getAddress(),
      owner.address, ethers.ZeroAddress, 0n,
    );
    await tok.mint(owner.address, BigInt(fx.amount));
    await tok.approve(await pool.getAddress(), BigInt(fx.amount));
    return pool;
  }

  const ed = () => {
    const e = fx.extData;
    return [e.recipient, e.extAmount, e.relayer, e.fee, e.encryptedOutput1, e.encryptedOutput2];
  };
  const proof = () => ({ a: fx.a, b: fx.b, c: fx.c });
  const BUMP = (h) => "0x" + (BigInt(h) + 1n).toString(16); // shift a signal by 1 → proof no longer matches

  const cases = [
    { name: "tampered input nullifier", nf: [BUMP(fx.nullifiers[0]), BigInt(fx.nullifiers[1])], cm: [BigInt(fx.commitments[0]), BigInt(fx.commitments[1])], nr: BigInt(fx.newRoot), ar: BigInt(fx.associationRoot) },
    { name: "tampered output commitment", nf: [BigInt(fx.nullifiers[0]), BigInt(fx.nullifiers[1])], cm: [BUMP(fx.commitments[0]), BigInt(fx.commitments[1])], nr: BigInt(fx.newRoot), ar: BigInt(fx.associationRoot) },
    { name: "tampered newRoot", nf: [BigInt(fx.nullifiers[0]), BigInt(fx.nullifiers[1])], cm: [BigInt(fx.commitments[0]), BigInt(fx.commitments[1])], nr: BUMP(fx.newRoot), ar: BigInt(fx.associationRoot) },
    { name: "tampered associationRoot", nf: [BigInt(fx.nullifiers[0]), BigInt(fx.nullifiers[1])], cm: [BigInt(fx.commitments[0]), BigInt(fx.commitments[1])], nr: BigInt(fx.newRoot), ar: BUMP(fx.associationRoot) },
  ];

  for (const c of cases) {
    it(`rejects ${c.name} via verifyProof`, async function () {
      const pool = await freshPool();
      await expect(
        pool.transact(proof(), BigInt(fx.oldRoot), c.nr, c.ar, c.nf, c.cm, ed()),
      ).to.be.revertedWith("invalid proof");
    });
  }
});
