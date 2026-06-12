// Browser/WebView-Entry des SDK (für esbuild-Bundle). Kein snarkjs, keine Node-Pfade.
// Das Proven macht das separat geladene snarkjs (Browser-Bundle) bzw. rapidsnark (Prod).
import { Buffer } from "buffer";
if (!globalThis.Buffer) globalThis.Buffer = Buffer;

export { FIELD_SIZE, ZERO_VALUE, MERKLE_LEVELS } from "./constants.js";
export { poseidon, getPoseidon } from "./poseidon.js";
export { Keypair, randomField } from "./keypair.js";
export { Note } from "./note.js";
export { MerkleTree } from "./merkleTree.js";
export { ShieldedWallet } from "./wallet.js";
export { syncFromChain, syncFromIndexer } from "./sync.js";
export { OcpClient } from "./ocpClient.js";
export { buildWitness, noteNullifier, encodeExtData, toSolidityProof } from "./witness.js";
