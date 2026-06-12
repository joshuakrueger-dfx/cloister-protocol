import { poseidon } from "./poseidon.js";
import { ZERO_VALUE, MERKLE_LEVELS } from "./constants.js";

// Fixed-depth Poseidon-Merkle-Tree (JS-Spiegel des Contracts). Leaves werden in
// On-chain-Reihenfolge eingefügt; root() == Pool.getLastRoot().
export class MerkleTree {
  constructor(levels = MERKLE_LEVELS) {
    this.levels = levels;
    this.leaves = [];
    this.zeros = [];
    this._ready = false;
  }

  async init() {
    let z = ZERO_VALUE;
    this.zeros[0] = z;
    for (let i = 1; i <= this.levels; i++) {
      z = await poseidon([z, z]);
      this.zeros[i] = z;
    }
    this._ready = true;
    return this;
  }

  insert(leaf) {
    this.leaves.push(BigInt(leaf));
    return this.leaves.length - 1; // index
  }

  indexOf(commitment) {
    const c = BigInt(commitment);
    return this.leaves.findIndex((l) => l === c);
  }

  // Baut alle Ebenen; gibt {layers, root} zurück. Leere Plätze = zeros[level].
  async _build() {
    const layers = [this.leaves.slice()];
    for (let l = 0; l < this.levels; l++) {
      const cur = layers[l];
      const next = [];
      for (let i = 0; i < Math.ceil(cur.length / 2); i++) {
        const left = cur[2 * i];
        const right = 2 * i + 1 < cur.length ? cur[2 * i + 1] : this.zeros[l];
        next.push(await poseidon([left, right]));
      }
      layers.push(next);
    }
    const root = layers[this.levels].length ? layers[this.levels][0] : this.zeros[this.levels];
    return { layers, root };
  }

  async root() {
    return (await this._build()).root;
  }

  // Root, wenn zusätzlich `extra` Leaves angehängt würden (ohne Mutation).
  async rootWith(extra) {
    const saved = this.leaves;
    this.leaves = saved.concat(extra.map((x) => BigInt(x)));
    const r = await this.root();
    this.leaves = saved;
    return r;
  }

  // Merkle-Pfad eines Paar-Knotens (Ebene 1) im Tree-of-Pairs (Tiefe levels-1).
  // Genutzt für den Off-chain-Insertion-Beweis: 2 Outputs = ein Paar-Knoten.
  async pairPath(pairIndex) {
    const { layers } = await this._build();
    const pathElements = [];
    const bits = [];
    let idx = pairIndex;
    for (let pl = 0; pl < this.levels - 1; pl++) {
      const layer = layers[1 + pl] || [];
      const zero = this.zeros[1 + pl];
      const isRight = idx % 2;
      const sibIdx = isRight ? idx - 1 : idx + 1;
      const sibling = sibIdx < layer.length ? layer[sibIdx] : zero;
      pathElements.push(sibling);
      bits.push(BigInt(isRight));
      idx = Math.floor(idx / 2);
    }
    let pathIndices = 0n;
    for (let i = bits.length - 1; i >= 0; i--) pathIndices = pathIndices * 2n + bits[i];
    return { pathElements, pathIndices };
  }

  // pathElements[levels], pathIndices (LSB-first als Feld), root — für leaf an `index`.
  async path(index) {
    const { layers, root } = await this._build();
    const pathElements = [];
    const indexBits = [];
    let idx = index;
    for (let l = 0; l < this.levels; l++) {
      const isRight = idx % 2;
      const sibIdx = isRight ? idx - 1 : idx + 1;
      const layer = layers[l];
      const sibling = sibIdx < layer.length ? layer[sibIdx] : this.zeros[l];
      pathElements.push(sibling);
      indexBits.push(BigInt(isRight));
      idx = Math.floor(idx / 2);
    }
    let pathIndices = 0n;
    for (let i = indexBits.length - 1; i >= 0; i--) pathIndices = pathIndices * 2n + indexBits[i];
    return { pathElements, pathIndices, root };
  }
}
