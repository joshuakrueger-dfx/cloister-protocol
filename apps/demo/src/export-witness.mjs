// Exportiert einen echten Witness + erwartete publicSignals für den WebView-Prover-Test.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { buildTransaction, artifactPaths, Keypair, Note, MerkleTree } from "@cloister/sdk";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "..", "..", "..", "packages", "prover-webview", "fixtures");
const { wasmPath, zkeyPath } = artifactPaths();

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

writeFileSync(resolve(OUT, "witness.json"), JSON.stringify(t.witnessInput, null, 2));
writeFileSync(resolve(OUT, "expected_public.json"), JSON.stringify(t.publicSignals, null, 2));
console.log("wrote fixtures/witness.json + expected_public.json");
console.log("publicSignals:", t.publicSignals.length, "signals");
