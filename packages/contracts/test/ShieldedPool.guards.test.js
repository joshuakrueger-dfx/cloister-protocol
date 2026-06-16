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
      await expect(Pool.deploy(0, LANES, INITIAL_ROOT, v, t, owner, ethers.ZeroAddress, 0n)).to.be.revertedWith("levels must be 20 (circuit-fixed)");
      await expect(Pool.deploy(19, LANES, INITIAL_ROOT, v, t, owner, ethers.ZeroAddress, 0n)).to.be.revertedWith("levels must be 20 (circuit-fixed)");
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

  describe("emergency kill-switch", () => {
    it("stops ALL tx, only guardian, and auto-expires (never permanently frozen)", async () => {
      const tok = await (await ethers.getContractFactory("ReentrantToken")).deploy();
      const pool = await deployPool(await tok.getAddress(), await verifier.getAddress(), owner.address);
      const poolAddr = await pool.getAddress();
      await tok.approve(poolAddr, ethers.parseEther("2000"));
      await pool.transact(PROOF, INITIAL_ROOT, 100n, 0n, [1n, 2n], [3n, 4n], extData(ethers.ZeroAddress, ethers.parseEther("1000"), ethers.ZeroAddress, 0n));

      await expect(pool.connect(alice).emergencyPause()).to.be.revertedWith("only guardian");
      await pool.emergencyPause();

      // both a deposit AND a withdrawal are blocked while emergency-paused
      await expect(
        pool.transact(PROOF, 100n, 200n, 0n, [30n, 31n], [32n, 33n], extData(ethers.ZeroAddress, ethers.parseEther("10"), ethers.ZeroAddress, 0n)),
      ).to.be.revertedWith("emergency paused");
      await expect(
        pool.transact(PROOF, 100n, 200n, 0n, [40n, 41n], [42n, 43n], extData(attacker.address, -ethers.parseEther("100"), ethers.ZeroAddress, 0n)),
      ).to.be.revertedWith("emergency paused");

      // auto-expiry after MAX_EMERGENCY_PAUSE → transactions resume (funds never frozen)
      await ethers.provider.send("evm_increaseTime", [72 * 3600 + 1]);
      await ethers.provider.send("evm_mine", []);
      await expect(
        pool.transact(PROOF, 100n, 200n, 0n, [40n, 41n], [42n, 43n], extData(attacker.address, -ethers.parseEther("100"), ethers.ZeroAddress, 0n)),
      ).to.not.be.reverted;
    });

    it("guardian can lift the pause early", async () => {
      const tok = await (await ethers.getContractFactory("ReentrantToken")).deploy();
      const pool = await deployPool(await tok.getAddress(), await verifier.getAddress(), owner.address);
      await tok.approve(await pool.getAddress(), ethers.parseEther("1000"));
      await pool.transact(PROOF, INITIAL_ROOT, 100n, 0n, [1n, 2n], [3n, 4n], extData(ethers.ZeroAddress, ethers.parseEther("1000"), ethers.ZeroAddress, 0n));
      await pool.emergencyPause();
      await pool.liftEmergencyPause();
      await expect(
        pool.transact(PROOF, 100n, 200n, 0n, [40n, 41n], [42n, 43n], extData(attacker.address, -ethers.parseEther("100"), ethers.ZeroAddress, 0n)),
      ).to.not.be.reverted;
    });
  });

  describe("emergency pause cannot be renewed indefinitely (no permanent freeze)", () => {
    it("enforces a cooldown so withdrawals always get a guaranteed open window", async () => {
      const tok = await (await ethers.getContractFactory("ReentrantToken")).deploy();
      const pool = await deployPool(await tok.getAddress(), await verifier.getAddress(), owner.address);
      await tok.approve(await pool.getAddress(), ethers.parseEther("1000"));
      await pool.transact(PROOF, INITIAL_ROOT, 100n, 0n, [1n, 2n], [3n, 4n], extData(ethers.ZeroAddress, ethers.parseEther("1000"), ethers.ZeroAddress, 0n));

      await pool.emergencyPause();
      // advance past the 72h pause window → pause auto-expires
      await ethers.provider.send("evm_increaseTime", [72 * 3600 + 1]);
      await ethers.provider.send("evm_mine", []);
      // open window: withdrawal works again
      await expect(
        pool.transact(PROOF, 100n, 200n, 0n, [40n, 41n], [42n, 43n], extData(attacker.address, -ethers.parseEther("100"), ethers.ZeroAddress, 0n)),
      ).to.not.be.reverted;
      // a malicious guardian CANNOT immediately re-arm: the cooldown is still running
      await expect(pool.emergencyPause()).to.be.revertedWith("pause on cooldown");
      // only after the full cooldown may a new pause be armed
      await ethers.provider.send("evm_increaseTime", [72 * 3600 + 1]);
      await ethers.provider.send("evm_mine", []);
      await expect(pool.emergencyPause()).to.not.be.reverted;
    });

    it("lifting early starts the cooldown from now (short pause rewarded)", async () => {
      const tok = await (await ethers.getContractFactory("ReentrantToken")).deploy();
      const pool = await deployPool(await tok.getAddress(), await verifier.getAddress(), owner.address);
      await pool.emergencyPause();
      await pool.liftEmergencyPause();
      // still within the fresh cooldown → cannot re-arm yet
      await expect(pool.emergencyPause()).to.be.revertedWith("pause on cooldown");
      await ethers.provider.send("evm_increaseTime", [72 * 3600 + 1]);
      await ethers.provider.send("evm_mine", []);
      await expect(pool.emergencyPause()).to.not.be.reverted;
    });
  });

  describe("ASP root revocation + 2-step role transfers", () => {
    async function deployWithAsp(asp) {
      const tok = await (await ethers.getContractFactory("ReentrantToken")).deploy();
      const Pool = await ethers.getContractFactory("ShieldedPool");
      const pool = await Pool.deploy(LEVELS, LANES, INITIAL_ROOT, await verifier.getAddress(), await tok.getAddress(), owner.address, asp, 0n);
      return { pool, tok };
    }

    it("ASP can revoke a previously-published good-set root", async () => {
      const { pool, tok } = await deployWithAsp(owner.address);
      const R = 7777n;
      await pool.publishAspRoot(R);
      expect(await pool.knownAspRoot(R)).to.equal(true);
      // a tx bound to R passes the compliance gate (mock verifier)
      await tok.approve(await pool.getAddress(), ethers.parseEther("10"));
      await expect(
        pool.transact(PROOF, INITIAL_ROOT, 100n, R, [1n, 2n], [3n, 4n], extData(ethers.ZeroAddress, ethers.parseEther("10"), ethers.ZeroAddress, 0n)),
      ).to.not.be.reverted;
      // revoke → further tx bound to R are rejected
      await expect(pool.revokeAspRoot(R)).to.emit(pool, "AspRootRevoked").withArgs(R);
      expect(await pool.knownAspRoot(R)).to.equal(false);
      await expect(
        pool.transact(PROOF, 100n, 200n, R, [5n, 6n], [7n, 8n], extData(ethers.ZeroAddress, ethers.parseEther("10"), ethers.ZeroAddress, 0n)),
      ).to.be.revertedWith("unknown asp root");
      await expect(pool.revokeAspRoot(123n)).to.be.revertedWith("root not known");
      await expect(pool.connect(alice).revokeAspRoot(R)).to.be.revertedWith("only asp");
    });

    it("ASP transfer is two-step with zero-address protection", async () => {
      const { pool } = await deployWithAsp(owner.address);
      await expect(pool.transferAsp(ethers.ZeroAddress)).to.be.revertedWith("zero asp");
      await pool.transferAsp(alice.address);
      expect(await pool.asp()).to.equal(owner.address); // not yet
      await expect(pool.connect(attacker).acceptAsp()).to.be.revertedWith("only pending asp");
      await pool.connect(alice).acceptAsp();
      expect(await pool.asp()).to.equal(alice.address);
    });

    it("guardian transfer is two-step with zero-address protection", async () => {
      const { pool } = await deployWithAsp(ethers.ZeroAddress);
      await expect(pool.transferGuardian(ethers.ZeroAddress)).to.be.revertedWith("zero guardian");
      await pool.transferGuardian(alice.address);
      expect(await pool.guardian()).to.equal(owner.address); // not yet
      await expect(pool.connect(attacker).acceptGuardian()).to.be.revertedWith("only pending guardian");
      await pool.connect(alice).acceptGuardian();
      expect(await pool.guardian()).to.equal(alice.address);
    });
  });

  describe("publicAmount clamp (value-conservation safety net)", () => {
    // The circuit enforces sumIn + publicAmount == sumOut in the field but does NOT range-check
    // publicAmount in-circuit; field-wraparound minting is prevented by the contract clamping
    // |extAmount| and fee well below the field modulus (MAX_EXT_AMOUNT = 2^248 << p ~ 2^254).
    // These tests pin that clamp so the value-conservation guarantee can never silently regress.
    const MAX = 2n ** 248n;
    it("rejects extAmount and fee at/above MAX_EXT_AMOUNT", async () => {
      const tok = await (await ethers.getContractFactory("ReentrantToken")).deploy();
      const pool = await deployPool(await tok.getAddress(), await verifier.getAddress(), owner.address);
      await expect(
        pool.transact(PROOF, INITIAL_ROOT, 22222n, 0n, [1n, 2n], [3n, 4n], extData(ethers.ZeroAddress, MAX, ethers.ZeroAddress, 0n)),
      ).to.be.revertedWith("extAmount range");
      await expect(
        pool.transact(PROOF, INITIAL_ROOT, 22222n, 0n, [1n, 2n], [3n, 4n], extData(ethers.ZeroAddress, -MAX, ethers.ZeroAddress, 0n)),
      ).to.be.revertedWith("extAmount range");
      await expect(
        pool.transact(PROOF, INITIAL_ROOT, 22222n, 0n, [1n, 2n], [3n, 4n], extData(ethers.ZeroAddress, 0n, ethers.ZeroAddress, MAX)),
      ).to.be.revertedWith("fee too large");
    });
  });

  describe("withdrawal cap", () => {
    it("caps per-tx withdrawals, leaves deposits unaffected, only guardian", async () => {
      const tok = await (await ethers.getContractFactory("ReentrantToken")).deploy();
      const pool = await deployPool(await tok.getAddress(), await verifier.getAddress(), owner.address);
      const poolAddr = await pool.getAddress();
      await tok.approve(poolAddr, ethers.parseEther("2000"));
      await pool.transact(PROOF, INITIAL_ROOT, 100n, 0n, [1n, 2n], [3n, 4n], extData(ethers.ZeroAddress, ethers.parseEther("1000"), ethers.ZeroAddress, 0n));

      await expect(pool.connect(alice).setMaxWithdrawal(1n)).to.be.revertedWith("only guardian");
      await pool.setMaxWithdrawal(ethers.parseEther("50"));

      // over-cap withdrawal blocked (root unchanged on revert)
      await expect(
        pool.transact(PROOF, 100n, 200n, 0n, [40n, 41n], [42n, 43n], extData(attacker.address, -ethers.parseEther("100"), ethers.ZeroAddress, 0n)),
      ).to.be.revertedWith("withdrawal over cap");
      // within-cap withdrawal ok (root → 200)
      await expect(
        pool.transact(PROOF, 100n, 200n, 0n, [50n, 51n], [52n, 53n], extData(attacker.address, -ethers.parseEther("40"), ethers.ZeroAddress, 0n)),
      ).to.not.be.reverted;
      // deposits are unaffected by the withdrawal cap (root → 300)
      await expect(
        pool.transact(PROOF, 200n, 300n, 0n, [60n, 61n], [62n, 63n], extData(ethers.ZeroAddress, ethers.parseEther("10"), ethers.ZeroAddress, 0n)),
      ).to.not.be.reverted;
    });
  });
});
