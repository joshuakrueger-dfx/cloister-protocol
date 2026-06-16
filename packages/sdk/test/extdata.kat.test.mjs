import test from "node:test";
import assert from "node:assert/strict";
import { encodeExtData } from "../src/witness.js";

// Cross-language known-answer test for the extData binding — the real, independently
// implemented surface between the SDK (JS), the gnark prover (Go) and the verifier (Solidity).
//
// The SDK computes extDataHash = keccak256(abi.encode(extData)) % FIELD_SIZE. The gnark prover
// binds this exact value as public signal pub[2], and ShieldedPool._transact recomputes it
// on-chain in Solidity (keccak256(abi.encode(extData)) % FIELD_SIZE) before verifyProof. The
// golden below is the value bound into the gnark real-proof E2E deposit fixture
// (packages/contracts/test/testdata/transact.json), which is exercised live by
// ShieldedPool.transact.e2e.test.js — i.e. it is proven there that this same byte-exact value
// is produced by the Go prover and accepted by the Solidity verifier. This test pins the SDK's
// independent computation against that anchor as a fast regression guard.
//
// A divergence here is a silent recipient/amount/relayer/fee-malleability bug — it MUST stay
// byte-exact across all three languages.
const FIXTURE_EXTDATA = {
  recipient: "0x0000000000000000000000000000000000000000",
  extAmount: "1000000",
  relayer: "0x0000000000000000000000000000000000000000",
  fee: "0",
  encryptedOutput1: "0x",
  encryptedOutput2: "0x",
};
const GOLDEN = 7991534010791323028613306869803103856480061399247861396506522703945726000343n;

test("encodeExtData matches the gnark/Solidity-verified golden (SDK == Go == Solidity)", () => {
  assert.equal(encodeExtData(FIXTURE_EXTDATA), GOLDEN);
});

test("encodeExtData is binding: any field change moves the hash (no malleability)", () => {
  const base = encodeExtData(FIXTURE_EXTDATA);
  const otherRecipient = encodeExtData({ ...FIXTURE_EXTDATA, recipient: "0x0000000000000000000000000000000000000001" });
  const otherAmount = encodeExtData({ ...FIXTURE_EXTDATA, extAmount: "1000001" });
  const otherFee = encodeExtData({ ...FIXTURE_EXTDATA, fee: "1" });
  assert.notEqual(otherRecipient, base);
  assert.notEqual(otherAmount, base);
  assert.notEqual(otherFee, base);
});
