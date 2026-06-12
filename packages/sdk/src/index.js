import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

export { FIELD_SIZE, ZERO_VALUE, MERKLE_LEVELS } from "./constants.js";
export { poseidon, getPoseidon } from "./poseidon.js";
export { Keypair, randomField } from "./keypair.js";
export { Note } from "./note.js";
export { MerkleTree } from "./merkleTree.js";
export { buildTransaction, noteNullifier, encodeExtData } from "./prover.js";
export { ShieldedWallet } from "./wallet.js";
export { syncFromChain, syncFromIndexer } from "./sync.js";
export { OcpClient } from "./ocpClient.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Default-Pfade zu den Circuit-Artefakten (für lokale Nutzung im Monorepo).
export function artifactPaths(circuit = "transaction2") {
  const buildDir = resolve(__dirname, "..", "..", "circuits", "build");
  return {
    wasmPath: resolve(buildDir, `${circuit}_js`, `${circuit}.wasm`),
    zkeyPath: resolve(buildDir, `${circuit}_final.zkey`),
    vkeyPath: resolve(buildDir, "verification_key.json"),
  };
}
