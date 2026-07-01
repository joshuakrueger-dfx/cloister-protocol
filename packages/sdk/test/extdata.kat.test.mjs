import test from "node:test";
import assert from "node:assert/strict";
import { encodeExtData } from "../src/witness.js";

// Cross-language known-answer test for the extData binding — the real, independently
// implemented surface between the SDK (JS), the gnark prover (Go) and the verifier (Solidity).
//
// WP-A1 domain separation: the SDK computes
//   extDataHash = keccak256(abi.encode(extData, chainId, lane)) % FIELD_SIZE
// the gnark prover binds this exact value as public signal pub[2], and ShieldedPool._transact
// recomputes it on-chain in Solidity (keccak256(abi.encode(extData, block.chainid, lane)) %
// FIELD_SIZE) before verifyProof. Folding chainId + lane in pins a proof to one chain and one
// lane — replaying it on another chain or into another lane makes the recomputed hash differ and
// the verifier reject it. (Go == JS parity for this exact vector is checked in the prover-gnark
// suite; JS == Solidity follows from identical ABI encoding, as for the pre-WP-A1 golden.)
//
// GOLDEN below pins the SDK's independent computation of the domain-bound formula for a fixed
// (extData, domain) vector. The Go == Solidity cross-anchor is re-established when the real-proof
// E2E fixture (packages/contracts/test/testdata/transact.json) is regenerated with keys via
// `REGEN_FIXTURE=1` against the domain-aware contract (see gen-transact-fixture.js). A divergence
// here is a silent recipient/amount/relayer/fee OR chain/pool/lane malleability bug — it MUST stay
// byte-exact across all three languages.
const FIXTURE_EXTDATA = {
  recipient: "0x0000000000000000000000000000000000000000",
  extAmount: "1000000",
  relayer: "0x0000000000000000000000000000000000000000",
  fee: "0",
  encryptedOutput1: "0x",
  encryptedOutput2: "0x",
};
const FIXTURE_DOMAIN = { chainId: 8453n, lane: 0n };
const GOLDEN = 3784758706313429106804923912002032526961629395860516554266265525964119936530n;

test("encodeExtData matches the domain-bound golden (SDK self-anchor)", () => {
  assert.equal(encodeExtData(FIXTURE_EXTDATA, FIXTURE_DOMAIN), GOLDEN);
});

test("encodeExtData requires a domain (no chain-agnostic, replayable hash)", () => {
  assert.throws(() => encodeExtData(FIXTURE_EXTDATA), /requires domain/);
  assert.throws(() => encodeExtData(FIXTURE_EXTDATA, { chainId: 1n }), /requires domain/);
});

test("encodeExtData is binding: any extData field change moves the hash (no malleability)", () => {
  const base = encodeExtData(FIXTURE_EXTDATA, FIXTURE_DOMAIN);
  const otherRecipient = encodeExtData({ ...FIXTURE_EXTDATA, recipient: "0x0000000000000000000000000000000000000001" }, FIXTURE_DOMAIN);
  const otherAmount = encodeExtData({ ...FIXTURE_EXTDATA, extAmount: "1000001" }, FIXTURE_DOMAIN);
  const otherFee = encodeExtData({ ...FIXTURE_EXTDATA, fee: "1" }, FIXTURE_DOMAIN);
  assert.notEqual(otherRecipient, base);
  assert.notEqual(otherAmount, base);
  assert.notEqual(otherFee, base);
});

test("encodeExtData is domain-bound: chainId / lane each move the hash (no cross-chain / cross-lane replay)", () => {
  const base = encodeExtData(FIXTURE_EXTDATA, FIXTURE_DOMAIN);
  const otherChain = encodeExtData(FIXTURE_EXTDATA, { ...FIXTURE_DOMAIN, chainId: 1n });
  const otherLane = encodeExtData(FIXTURE_EXTDATA, { ...FIXTURE_DOMAIN, lane: 1n });
  assert.notEqual(otherChain, base);
  assert.notEqual(otherLane, base);
});
