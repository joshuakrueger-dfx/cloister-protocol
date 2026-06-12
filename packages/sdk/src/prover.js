import { groth16 } from "snarkjs";
import { buildWitness, toSolidityProof } from "./witness.js";

export { noteNullifier, encodeExtData, buildWitness } from "./witness.js";

// Node-Proven (Dateipfade). Browser/RN nutzt buildWitness + global snarkjs/rapidsnark.
export async function buildTransaction(opts) {
  const w = await buildWitness(opts);
  const { proof, publicSignals } = await groth16.fullProve(w.witnessInput, opts.wasmPath, opts.zkeyPath);
  return { proof: toSolidityProof(proof), publicSignals, ...w };
}
