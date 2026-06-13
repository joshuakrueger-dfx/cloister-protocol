// Browser/WebView-Entry des SDK (für esbuild-Bundle). Kein snarkjs, keine Node-Pfade.
// Hashing/Proving laufen über das Backend (backend.js) — im Browser via useHttpBackend
// gegen proverd. Der primäre Client-Pfad ist jedoch der native On-Device-Prover (RN).
import { Buffer } from "buffer";
if (!globalThis.Buffer) globalThis.Buffer = Buffer;

export { FIELD_SIZE, ZERO_VALUE, MERKLE_LEVELS } from "./constants.js";
export { poseidon } from "./poseidon.js";
export { setHashBackend, setProveBackend, useHttpBackend, hasHashBackend } from "./backend.js";
export { buildTransaction } from "./prover.js";
export { Keypair, randomField, generateMnemonic, validateMnemonic, spendKeyFromMnemonic, SUBGROUP_ORDER } from "./keypair.js";
export { Note } from "./note.js";
export { MerkleTree } from "./merkleTree.js";
export { ShieldedWallet } from "./wallet.js";
export { syncFromChain, syncFromIndexer } from "./sync.js";
export { OcpClient } from "./ocpClient.js";
export { buildWitness, noteNullifier, encodeExtData, toSolidityProof } from "./witness.js";
