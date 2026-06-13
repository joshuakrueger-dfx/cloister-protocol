import { backendHash } from "./backend.js";

// Poseidon2 over field elements (BigInt in, BigInt out). Delegates to the configured
// backend (native on-device prover, or proverd in Node/dev) so the hash is bit-for-bit
// identical to the gnark in-circuit Poseidon2 — the basis for commitment/nullifier/root
// consistency between the SDK and the circuit. Replaces the former circomlib Poseidon.
export async function poseidon(items) {
  return backendHash(items);
}
