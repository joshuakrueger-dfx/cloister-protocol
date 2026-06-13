import { buildWitness } from "./witness.js";
import { backendProve } from "./backend.js";

export { noteNullifier, encodeExtData, buildWitness, toSolidityProof } from "./witness.js";

// Builds a shielded transaction and proves it via the configured backend
// (on-device native module in the wallet, proverd in Node/dev). The backend returns
// the Groth16 proof already split into the (a,b,c) calldata the ShieldedPool consumes
// plus the 10 public signals — no snarkjs/circom artifacts involved.
export async function buildTransaction(opts) {
  const w = await buildWitness(opts);
  const { a, b, c, publicSignals, proofHex } = await backendProve(w.witnessInput);
  return {
    proof: { a, b, c },
    publicSignals,
    proofHex,
    ...w,
  };
}
