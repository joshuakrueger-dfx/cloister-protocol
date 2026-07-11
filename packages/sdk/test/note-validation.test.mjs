import test from "node:test";
import assert from "node:assert/strict";
import { Note } from "../src/note.js";

test("Note rejects negative and oversized amounts", () => {
  assert.throws(() => new Note({ amount: -1n, pubKey: 1n }), /248-bit range/);
  assert.throws(() => new Note({ amount: 2n ** 248n, pubKey: 1n }), /248-bit range/);
});

test("Note rejects non-field owner and blinding values", () => {
  const field = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
  assert.throws(() => new Note({ amount: 1n, pubKey: field }), /public key/);
  assert.throws(() => new Note({ amount: 1n, pubKey: 1n, blinding: field }), /blinding/);
});

test("encrypted note parser fails closed on malformed ciphertext", () => {
  assert.equal(Note.tryDecrypt("0x", new Uint8Array(32)), null);
  assert.throws(() => Note.viewTagOf("0x"), /too short/);
});
