import { Note } from "./note.js";
import { noteNullifier } from "./witness.js";

// Verfolgt die eigenen Notes durch Event-Scan. Der Merkle-Tree ist kanonisch/geteilt
// (alle Commitments in On-chain-Reihenfolge) — das Wallet entschlüsselt nur, was ihm gehört.
export class ShieldedWallet {
  constructor(keypair, tree, label = "wallet") {
    this.keypair = keypair;
    this.tree = tree;
    this.label = label;
    this.notes = []; // { note, index, spent }
  }

  // Auf ein NewCommitment-Event anwenden (Commitment ist bereits in den Tree eingefügt).
  // lane = Lane des Commitments (Default 0); index = LOKALer Leaf-Index in dieser Lane.
  async tryAdd(commitment, leafIndex, encryptedOutput, lane = 0) {
    if (!encryptedOutput || encryptedOutput === "0x") return false;
    const dec = Note.tryDecrypt(encryptedOutput, this.keypair.enc.secretKey);
    if (!dec) return false;
    const note = new Note({ amount: dec.amount, pubKey: this.keypair.publicKey, blinding: dec.blinding });
    const c = await note.commitment();
    if (c !== BigInt(commitment)) return false; // Memo nicht für diese Adresse bestimmt
    if (note.amount === 0n) return false; // Zero-Note ignorieren
    this.notes.push({ note, index: leafIndex, lane, spent: false });
    return true;
  }

  spendable() {
    return this.notes.filter((n) => !n.spent);
  }

  balance() {
    return this.spendable().reduce((acc, n) => acc + n.note.amount, 0n);
  }

  markSpent(indices, lane = null) {
    const set = new Set(indices);
    for (const n of this.notes) if (set.has(n.index) && (lane == null || n.lane === lane)) n.spent = true;
  }

  markSpentAt(lane, index) {
    for (const n of this.notes) if (n.lane === lane && n.index === index) n.spent = true;
  }

  // Reconcile local note state with the canonical on-chain nullifier set. This is required on
  // seed recovery: localStorage is only a UI cache and must never be the source of truth for
  // whether a note is spendable.
  async reconcileSpent(isSpent) {
    for (const n of this.notes) {
      if (n.spent) continue;
      const commitment = await n.note.commitment();
      const { pathIndices } = await this.tree.path(n.index);
      const nullifier = await noteNullifier(commitment, pathIndices, this.keypair.privateKey);
      if (await isSpent(nullifier, n)) n.spent = true;
    }
  }
}
