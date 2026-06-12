import { Note } from "./note.js";

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

  markSpent(indices) {
    const set = new Set(indices);
    for (const n of this.notes) if (set.has(n.index)) n.spent = true;
  }
}
