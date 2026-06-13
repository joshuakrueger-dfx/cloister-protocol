const { expect } = require("chai");
const { ethers } = require("hardhat");
const fs = require("fs");
const path = require("path");

// Real Groth16 proof produced by the gnark prover (packages/prover-gnark/cmd/emitproof).
const proof = JSON.parse(
  fs.readFileSync(path.join(__dirname, "testdata", "proof.json"), "utf8")
);

describe("TransactionVerifier (gnark Groth16, MIT)", function () {
  let verifier;

  before(async function () {
    const F = await ethers.getContractFactory("TransactionVerifier");
    verifier = await F.deploy();
    await verifier.waitForDeployment();
  });

  it("accepts a valid proof through the (a,b,c) adapter", async function () {
    const ok = await verifier["verifyProof(uint256[2],uint256[2][2],uint256[2],uint256[10])"](
      proof.a,
      proof.b,
      proof.c,
      proof.input
    );
    expect(ok).to.equal(true);
  });

  it("accepts the same proof through the native bytes interface", async function () {
    // gnark bytes verifier reverts on failure → a non-reverting staticcall == valid.
    await verifier["verifyProof(bytes,uint256[10])"](proof.proofHex, proof.input);
  });

  it("rejects a proof with a tampered public signal", async function () {
    const bad = [...proof.input];
    bad[0] = "0x" + (BigInt(bad[0]) ^ 1n).toString(16); // flip a bit in Root
    const ok = await verifier["verifyProof(uint256[2],uint256[2][2],uint256[2],uint256[10])"](
      proof.a,
      proof.b,
      proof.c,
      bad
    );
    expect(ok).to.equal(false);
  });

  it("rejects a tampered proof element", async function () {
    const badC = [...proof.c];
    badC[0] = "0x" + (BigInt(badC[0]) ^ 1n).toString(16);
    const ok = await verifier["verifyProof(uint256[2],uint256[2][2],uint256[2],uint256[10])"](
      proof.a,
      proof.b,
      badC,
      proof.input
    );
    expect(ok).to.equal(false);
  });
});
