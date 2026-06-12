// Prover-Spike (Schritt 2, Teil A): de-riskt den mobilen Prover OHNE Phone, indem die
// zwei RN-kritischen Annahmen verifiziert werden:
//   1) snarkjs erzeugt einen gültigen Proof aus IN-MEMORY-Bytes (kein Dateisystem)
//      → genau der RN/WebView/Bundled-Asset-Fall.
//   2) ein pure-JS Poseidon (poseidon-lite, RN-tauglich) liefert bit-identische Hashes
//      zum Circuit (circomlibjs) → der RN-Client kann Commitments/Nullifier ohne WASM rechnen.
import { readFileSync } from "node:fs";
import { groth16 } from "snarkjs";
import { poseidon2, poseidon3 } from "poseidon-lite";
import { buildTransaction, artifactPaths, Keypair, Note, MerkleTree, poseidon as circomPoseidon } from "@cloister/sdk";

const { wasmPath, zkeyPath, vkeyPath } = artifactPaths();
const log = (...a) => console.log(...a);

async function main() {
  log("\n=== Cloister Prover-Spike (RN-Tauglichkeit) ===\n");

  // ---------- (2) Poseidon-Kompatibilität pure-JS vs Circuit ----------
  log("[A] Poseidon: poseidon-lite (pure JS, RN) vs circomlibjs (Circuit)");
  const a = 123456789n, b = 987654321n, c = 555n;
  const lite2 = poseidon2([a, b]);
  const circ2 = await circomPoseidon([a, b]);
  const lite3 = poseidon3([a, b, c]);
  const circ3 = await circomPoseidon([a, b, c]);
  const pOk = lite2 === circ2 && lite3 === circ3;
  log(`    Poseidon(2) gleich: ${lite2 === circ2}`);
  log(`    Poseidon(3) gleich: ${lite3 === circ3}`);
  log(`    → pure-JS Poseidon ist ${pOk ? "bit-identisch ✅ (RN-Client braucht kein WASM dafür)" : "ABWEICHEND ❌"}`);

  // ---------- (1) Proof aus In-Memory-Bytes ----------
  log("\n[B] snarkjs Proof aus IN-MEMORY-Bytes (kein fs — wie im RN-Bundle):");
  // ein echter Witness über das SDK (Shield 1000)
  const tree = await new MerkleTree().init();
  const alice = await Keypair.create();
  const t = await buildTransaction({
    tree,
    inputs: [],
    outputs: [{ note: new Note({ amount: 1000n, pubKey: alice.publicKey }), encPubKey: alice.address().encPubKey }],
    extAmount: 1000n,
    wasmPath,
    zkeyPath,
  });
  log("    (Baseline: Proof via Dateipfade erzeugt ✓)");

  // jetzt derselbe Witness, aber wasm+zkey als Bytes im Speicher
  const wasmBytes = new Uint8Array(readFileSync(wasmPath));
  const zkeyBytes = new Uint8Array(readFileSync(zkeyPath));
  log(`    geladen: wasm ${(wasmBytes.length / 1024).toFixed(0)} KB, zkey ${(zkeyBytes.length / 1024 / 1024).toFixed(1)} MB (als Uint8Array)`);

  const T0 = process.hrtime.bigint();
  const { proof, publicSignals } = await groth16.fullProve(
    t.witnessInput,
    wasmBytes,
    { type: "mem", data: zkeyBytes },
  );
  const ms = Number(process.hrtime.bigint() - T0) / 1e6;

  const vKey = JSON.parse(readFileSync(vkeyPath, "utf8"));
  const ok = await groth16.verify(vKey, publicSignals, proof);
  log(`    Proof erzeugt in ${ms.toFixed(0)} ms (Desktop-Node; Phone via rapidsnark ähnlich/schneller)`);
  log(`    Proof verifiziert: ${ok ? "✅" : "❌"}`);

  log("\n=== Ergebnis ===");
  const pass = pOk && ok;
  log(pass
    ? "✅ Beide RN-Blocker entschärft: Prover läuft aus Bytes, Poseidon ist pure-JS-kompatibel.\n   → RN-Client kann Notes/Nullifier in pure JS rechnen; Prover-Backend (WebView/rapidsnark) lädt wasm+zkey als Assets."
    : "❌ Mindestens eine Annahme verletzt — siehe oben.");
  process.exit(pass ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
