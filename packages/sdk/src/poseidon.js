import { buildPoseidon } from "circomlibjs";

let _poseidon;

export async function getPoseidon() {
  if (!_poseidon) _poseidon = await buildPoseidon();
  return _poseidon;
}

// Poseidon-Hash über Feld-Elemente (BigInt in, BigInt out) — identisch zu circomlib im Circuit.
export async function poseidon(items) {
  const p = await getPoseidon();
  const out = p(items.map((x) => p.F.e(x)));
  return p.F.toObject(out);
}
