const { expect } = require("chai");
const { ethers } = require("hardhat");

// Guard-/Härtungs-Tests für ShieldedPool. Der zk-Verifier wird durch MockVerifier ersetzt
// (gibt immer true zurück), damit wir die Contract-Sicherheitslogik isoliert prüfen können:
// Reentrancy, SafeERC20, Fee-on-Transfer-Schutz, Duplicate-Nullifier, Pause, Constructor-Guards.
const INITIAL_ROOT = 12345n;
const LEVELS = 20;
const LANES = 8;
const PROOF = [
  [0n, 0n],
  [
    [0n, 0n],
    [0n, 0n],
  ],
  [0n, 0n],
];
const EMPTY = "0x";

function extData(recipient, extAmount, relayer, fee) {
  return [recipient, extAmount, relayer, fee, EMPTY, EMPTY];
}

async function deployPool(tokenAddr, verifierAddr, guardian) {
  const Pool = await ethers.getContractFactory("ShieldedPool");
  return Pool.deploy(LEVELS, LANES, INITIAL_ROOT, verifierAddr, tokenAddr, guardian, ethers.ZeroAddress, 0n);
}

describe("ShieldedPool — security hardening", () => {
  let owner, alice, attacker, verifier;

  beforeEach(async () => {
    [owner, alice, attacker] = await ethers.getSigners();
    verifier = await (await ethers.getContractFactory("MockVerifier")).deploy();
  });

  describe("constructor validation", () => {
    it("rejects zero verifier / token, bad levels, oversized index space, bad initial root", async () => {
      const Pool = await ethers.getContractFactory("ShieldedPool");
      const tok = await (await ethers.getContractFactory("ReentrantToken")).deploy();
      const v = await verifier.getAddress();
      const t = await tok.getAddress();
      await expect(Pool.deploy(LEVELS, LANES, INITIAL_ROOT, ethers.ZeroAddress, t, owner, ethers.ZeroAddress, 0n)).to.be.revertedWith("verifier");
      await expect(Pool.deploy(LEVELS, LANES, INITIAL_ROOT, v, ethers.ZeroAddress, owner, ethers.ZeroAddress, 0n)).to.be.revertedWith("token");
      await expect(Pool.deploy(0, LANES, INITIAL_ROOT, v, t, owner, ethers.ZeroAddress, 0n)).to.be.revertedWith("levels");
      await expect(Pool.deploy(33, LANES, INITIAL_ROOT, v, t, owner, ethers.ZeroAddress, 0n)).to.be.revertedWith("levels");
      // numLanes << levels must fit uint32: 2^13 << 20 = 2^33 > uint32 → revert
      await expect(Pool.deploy(20, 8192, INITIAL_ROOT, v, t, owner, ethers.ZeroAddress, 0n)).to.be.revertedWith("index space");
      const FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
      await expect(Pool.deploy(LEVELS, LANES, FIELD, v, t, owner, ethers.ZeroAddress, 0n)).to.be.revertedWith("initialRoot");
    });
  });

  describe("ERC20 safety", () => {
    it("works with a no-return (USDT-style) token via SafeERC20", async () => {
      const tok = await (await ethers.getContractFactory("NoReturnToken")).deploy();
      const pool = await deployPool(await tok.getAddress(), await verifier.getAddress(), owner.address);
      await tok.approve(await pool.getAddress(), 1000n);
      // deposit 1000 (extAmount +1000) — no-return transferFrom must not break
      await expect(
        pool.transact(PROOF, INITIAL_ROOT, 22222n, 0n, [1n, 2n], [3n, 4n], extData(ethers.ZeroAddress, 1000n, ethers.ZeroAddress, 0n)),
      ).to.not.be.reverted;
      expect(await tok.balanceOf(await pool.getAddress())).to.equal(1000n);
    });

    it("rejects fee-on-transfer tokens on deposit (no under-collateralisation)", async () => {
      const tok = await (await ethers.getContractFactory("FeeOnTransferToken")).deploy();
      const pool = await deployPool(await tok.getAddress(), await verifier.getAddress(), owner.address);
      await tok.approve(await pool.getAddress(), ethers.parseEther("1000"));
      await expect(
        pool.transact(PROOF, INITIAL_ROOT, 22222n, 0n, [1n, 2n], [3n, 4n], extData(ethers.ZeroAddress, ethers.parseEther("1000"), ethers.ZeroAddress, 0n)),
      ).to.be.revertedWith("fee-on-transfer unsupported");
    });
  });

  describe("duplicate nullifier", () => {
    it("rejects a tx with both input nullifiers equal", async () => {
      const tok = await (await ethers.getContractFactory("ReentrantToken")).deploy();
      const pool = await deployPool(await tok.getAddress(), await verifier.getAddress(), owner.address);
      await expect(
        pool.transact(PROOF, INITIAL_ROOT, 22222n, 0n, [7n, 7n], [3n, 4n], extData(ethers.ZeroAddress, 0n, ethers.ZeroAddress, 0n)),
      ).to.be.revertedWith("duplicate nullifier");
    });
  });

  describe("reentrancy", () => {
    it("blocks a hook-token from re-entering transact and draining the pool", async () => {
      const tok = await (await ethers.getContractFactory("ReentrantToken")).deploy();
      const pool = await deployPool(await tok.getAddress(), await verifier.getAddress(), owner.address);
      const poolAddr = await pool.getAddress();

      // Fund the pool with a 1000 deposit.
      await tok.approve(poolAddr, ethers.parseEther("1000"));
      await pool.transact(PROOF, INITIAL_ROOT, 100n, 0n, [1n, 2n], [3n, 4n], extData(ethers.ZeroAddress, ethers.parseEther("1000"), ethers.ZeroAddress, 0n));
      expect(await tok.balanceOf(poolAddr)).to.equal(ethers.parseEther("1000"));

      // Arm the token: on the next pool→recipient transfer, re-enter transact for another withdraw.
      const reentryPayload = pool.interface.encodeFunctionData("transact", [
        PROOF, 100n, 200n, 0n, [10n, 11n], [12n, 13n], extData(attacker.address, -ethers.parseEther("500"), ethers.ZeroAddress, 0n),
      ]);
      await tok.setAttack(poolAddr, reentryPayload);

      // Outer withdraw of 500 → triggers the hook → re-entry must be blocked by the guard.
      await pool.transact(PROOF, 100n, 200n, 0n, [20n, 21n], [22n, 23n], extData(attacker.address, -ethers.parseEther("500"), ethers.ZeroAddress, 0n));

      expect(await tok.reentryReverted()).to.equal(true); // guard tripped
      // Only ONE withdraw happened — pool keeps 500, attacker got 500 (not drained to 0).
      expect(await tok.balanceOf(poolAddr)).to.equal(ethers.parseEther("500"));
      expect(await tok.balanceOf(attacker.address)).to.equal(ethers.parseEther("500"));
    });
  });

  describe("guardian deposit pause", () => {
    it("guardian can pause deposits but never blocks withdrawals", async () => {
      const tok = await (await ethers.getContractFactory("ReentrantToken")).deploy();
      const pool = await deployPool(await tok.getAddress(), await verifier.getAddress(), owner.address);
      const poolAddr = await pool.getAddress();

      // pre-fund pool for withdrawals
      await tok.approve(poolAddr, ethers.parseEther("1000"));
      await pool.transact(PROOF, INITIAL_ROOT, 100n, 0n, [1n, 2n], [3n, 4n], extData(ethers.ZeroAddress, ethers.parseEther("1000"), ethers.ZeroAddress, 0n));

      await pool.setDepositsPaused(true);

      // deposit blocked
      await expect(
        pool.transact(PROOF, 100n, 200n, 0n, [30n, 31n], [32n, 33n], extData(ethers.ZeroAddress, ethers.parseEther("10"), ethers.ZeroAddress, 0n)),
      ).to.be.revertedWith("deposits paused");

      // withdrawal STILL works while paused (funds never frozen)
      await expect(
        pool.transact(PROOF, 100n, 200n, 0n, [40n, 41n], [42n, 43n], extData(attacker.address, -ethers.parseEther("100"), ethers.ZeroAddress, 0n)),
      ).to.not.be.reverted;

      // non-guardian cannot pause
      await expect(pool.connect(alice).setDepositsPaused(false)).to.be.revertedWith("only guardian");
    });
  });
});
