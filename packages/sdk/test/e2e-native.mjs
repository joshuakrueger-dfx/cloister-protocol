// End-to-end verification of the gnark SDK rewire. Wires the SDK to a running
// proverd (Poseidon2 hashing + Groth16 proving), builds the canonical internal
// payment (1000 → 250 + 750), and proves it. proverd self-verifies the proof before
// returning, so a successful run proves the rewired SDK crypto (curve-free pubKey,
// Poseidon2, zero=0) matches the gnark circuit EXACTLY — otherwise the witness would
// be unsatisfiable and proving would fail.
//
// proverd is a live service (it holds the proving key), so this test is SKIPPED when
// no proverd is reachable — e.g. the default `node --test` run in the SDK unit job. CI
// exercises it for real in the dedicated `e2e` job, which boots proverd first. Run it
// locally with:  node --test packages/sdk/test/e2e-native.mjs   (proverd on :8799), or
// point it elsewhere via PROVERD_URL / the first CLI arg.
import { test } from "node:test";
import assert from "node:assert";
import { Keypair } from "../src/keypair.js";
import { Note } from "../src/note.js";
import { MerkleTree } from "../src/merkleTree.js";
import { buildTransaction } from "../src/prover.js";
import { useHttpBackend } from "../src/backend.js";

const URL = process.env.PROVERD_URL || process.argv[2] || "http://127.0.0.1:8799";

// Probe proverd once up front so the test reports a clear skip reason instead of a
// noisy `fetch failed` when the service isn't running.
async function proverdReachable() {
  try {
    const res = await fetch(`${URL}/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

const reachable = await proverdReachable();

test(
  "SDK rewire E2E: curve-free pubKey + Poseidon2 + zero=0 satisfy the gnark circuit (via proverd)",
  { skip: reachable ? false : `proverd not reachable at ${URL} — start it or set PROVERD_URL` },
  async () => {
    useHttpBackend(URL);

    const A = await Keypair.create(111n); // payer
    const B = await Keypair.create(222n); // payee

    const tree = new MerkleTree(20);
    await tree.init();

    const inNote = new Note({ amount: 1000n, pubKey: A.publicKey, blinding: 555n });
    tree.insert(await inNote.commitment()); // leaf 0
    tree.insert(424242n); // filler leaf 1 → even length

    const out0 = new Note({ amount: 250n, pubKey: B.publicKey, blinding: 1001n }); // payment
    const out1 = new Note({ amount: 750n, pubKey: A.publicKey, blinding: 1002n }); // change

    const tx = await buildTransaction({
      tree,
      // WP-A1: domain is required by encodeExtData; this test only proves+shape-checks (no
      // on-chain submit), so fixed placeholder values are fine.
      chainId: 31337n,
      lane: 0n,
      inputs: [{ note: inNote, privateKey: 111n, index: 0 }],
      outputs: [
        { note: out0, encPubKey: B.address().encPubKey },
        { note: out1, encPubKey: A.address().encPubKey },
      ],
      extAmount: 0n,
      fee: 0n,
    });

    // proverd already verified the proof; assert the shape + key invariants.
    assert.equal(tx.proof.a.length, 2, "proof.a");
    assert.equal(tx.publicSignals.length, 10, "10 public signals");
    assert.ok(tx.proofHex.startsWith("0x") && tx.proofHex.length === 2 + 512, "256-byte proof");
    // public[1] (publicAmount) must be 0 for an internal pay
    assert.equal(BigInt(tx.publicSignals[1]), 0n, "publicAmount == 0");

    console.log("✓ SDK rewire verified: curve-free pubKey + Poseidon2 + zero=0 satisfy the gnark circuit");
    console.log("  root        =", tx.root);
    console.log("  newRoot     =", tx.newRoot);
    console.log("  nullifiers  =", tx.inputNullifiers.map((s) => s.slice(0, 12) + "…"));
    console.log("  proof       =", tx.proofHex.slice(0, 18) + "…");
  },
);
