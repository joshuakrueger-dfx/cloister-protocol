// End-to-end verification of the gnark SDK rewire. Wires the SDK to a running
// proverd (Poseidon2 hashing + Groth16 proving), builds the canonical internal
// payment (1000 → 250 + 750), and proves it. proverd self-verifies the proof before
// returning, so a successful run proves the rewired SDK crypto (curve-free pubKey,
// Poseidon2, zero=0) matches the gnark circuit EXACTLY — otherwise the witness would
// be unsatisfiable and proving would fail.
//
// Usage: node test/e2e-native.mjs [proverdUrl]   (default http://127.0.0.1:8799)
import assert from "node:assert";
import { Keypair } from "../src/keypair.js";
import { Note } from "../src/note.js";
import { MerkleTree } from "../src/merkleTree.js";
import { buildTransaction } from "../src/prover.js";
import { useHttpBackend } from "../src/backend.js";

const URL = process.argv[2] || "http://127.0.0.1:8799";

async function main() {
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
}

main().catch((e) => {
  console.error("✗", e.message);
  process.exit(1);
});
