import test from "node:test";
import assert from "node:assert/strict";
import { syncFromChain, syncFromIndexer } from "../src/sync.js";
import { buildWitness } from "../src/witness.js";
import { ShieldedWallet } from "../src/wallet.js";
import { Note } from "../src/note.js";

// WP-A3 — regression guards for the SDK merkle-sync integrity fixes.
// A missing leaf (indexer gap) used to silently shift every later leaf's tree position and
// desync the local root; an odd leaf count made buildWitness produce a malformed witness.
// Both must now fail fast with a clear error instead of corrupting state.

// Minimal tree stub: buildWitness's even-length guard and the sync loops only touch
// `leaves` / `insert` before the code paths we exercise here.
function treeStub(leafCount = 0) {
  return { leaves: Array.from({ length: leafCount }, (_, i) => BigInt(i + 1)), insert(c) { this.leaves.push(BigInt(c)); } };
}

test("syncFromChain throws on a leaf-index gap (does not corrupt the tree)", async () => {
  const tree = treeStub(0);
  // events 0 then 2 — index 1 is missing.
  const pool = {
    filters: { NewCommitment: () => ({}) },
    queryFilter: async () => [
      { args: [10n, 0, "0x"] },
      { args: [12n, 2, "0x"] },
    ],
  };
  await assert.rejects(() => syncFromChain(pool, tree, [], 0), /leaf gap: expected index 1, got 2/);
  assert.equal(tree.leaves.length, 1, "only the contiguous prefix was inserted");
});

test("syncFromChain accepts a contiguous run", async () => {
  const tree = treeStub(0);
  const pool = {
    filters: { NewCommitment: () => ({}) },
    queryFilter: async () => [
      { args: [10n, 0, "0x"] },
      { args: [11n, 1, "0x"] },
    ],
  };
  const added = await syncFromChain(pool, tree, [], 0);
  assert.equal(added, 2);
  assert.equal(tree.leaves.length, 2);
});

test("syncFromIndexer throws on a leaf-index gap", async () => {
  const tree = treeStub(0);
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      commitments: [
        { leafIndex: 0, commitment: 10n, encryptedOutput: "0x" },
        { leafIndex: 2, commitment: 12n, encryptedOutput: "0x" },
      ],
    }),
  });
  try {
    await assert.rejects(() => syncFromIndexer("http://indexer.test", tree, []), /leaf gap: expected index 1, got 2/);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("syncFromIndexer rebases global lane indices to a lane-local tree", async () => {
  const tree = treeStub(0);
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      commitments: [{ leafIndex: 2 ** 20, localIndex: 0, lane: 1, commitment: 99n, encryptedOutput: "0x" }],
    }),
  });
  try {
    const stats = await syncFromIndexer("http://indexer.test", tree, [], { lane: 1, levels: 20 });
    assert.equal(stats.decrypted, 0);
    assert.deepEqual(tree.leaves, [99n]);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("buildWitness rejects an odd leaf count", async () => {
  await assert.rejects(
    () => buildWitness({ tree: treeStub(3) }),
    /buildWitness requires an even leaf count, got 3/,
  );
});

test("wallet spent flags are lane-local", async () => {
  const kp = { publicKey: 7n };
  const wallet = new ShieldedWallet(kp, treeStub(0));
  wallet.notes = [
    { note: new Note({ amount: 1n, pubKey: kp.publicKey, blinding: 1n }), index: 0, lane: 0, spent: false },
    { note: new Note({ amount: 1n, pubKey: kp.publicKey, blinding: 2n }), index: 0, lane: 1, spent: false },
  ];
  wallet.markSpent([0], 1);
  assert.equal(wallet.notes[0].spent, false);
  assert.equal(wallet.notes[1].spent, true);
});
