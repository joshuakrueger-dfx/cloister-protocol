export { FIELD_SIZE, ZERO_VALUE, MERKLE_LEVELS } from "./constants.js";
export { poseidon } from "./poseidon.js";
export {
  setHashBackend,
  setProveBackend,
  hasHashBackend,
  backendHash,
  backendProve,
  useHttpBackend,
} from "./backend.js";
export { Keypair, randomField, generateMnemonic, validateMnemonic, spendKeyFromMnemonic, SUBGROUP_ORDER } from "./keypair.js";
export { Note } from "./note.js";
export { MerkleTree } from "./merkleTree.js";
export { buildTransaction } from "./prover.js";
export { buildWitness, noteNullifier, encodeExtData, toSolidityProof } from "./witness.js";
export { ShieldedWallet } from "./wallet.js";
export { syncFromChain, syncFromIndexer, syncWithFallback } from "./sync.js";
export { submitShielded } from "./submit.js";
export { OcpClient } from "./ocpClient.js";

// NOTE: the SDK no longer ships circom/snarkjs artifacts (wasm/zkey). Proving is
// delegated to a backend (on-device native module in the wallet, proverd in dev) —
// see backend.js. This keeps the SDK bundleable in React Native / Hermes (no node
// builtins at module scope).
