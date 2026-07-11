import nacl from "tweetnacl";
import { sha256 } from "./cryptoShim.js";
import { poseidon } from "./poseidon.js";
import { randomField } from "./keypair.js";
import { FIELD_SIZE } from "./constants.js";

const MAX_NOTE_AMOUNT = 2n ** 248n;

function fieldElement(value, label) {
  const n = BigInt(value);
  if (n < 0n || n >= FIELD_SIZE) throw new Error(`${label} outside BN254 scalar field`);
  return n;
}

// Eine Note (UTXO): commitment = Poseidon(amount, ownerPubKey, blinding).
export class Note {
  constructor({ amount, pubKey, blinding }) {
    this.amount = BigInt(amount);
    if (this.amount < 0n || this.amount >= MAX_NOTE_AMOUNT) throw new Error("note amount outside 248-bit range");
    this.pubKey = fieldElement(pubKey, "note public key");
    this.blinding = blinding === undefined ? randomField() : fieldElement(blinding, "note blinding");
    this._commitment = null;
  }

  async commitment() {
    if (this._commitment === null) {
      this._commitment = await poseidon([this.amount, this.pubKey, this.blinding]);
    }
    return this._commitment;
  }

  // Memo (amount + blinding) an die Empfänger-Viewing-Key verschlüsseln.
  // Format: ephemeralPub(32) | viewTag(1) | nonce(24) | ciphertext  → hex (mit 0x).
  // viewTag = sha256(sharedSecret)[0] erlaubt Wallets, ~255/256 Fremd-Notes ohne
  // Voll-Entschlüsselung (box.open) zu verwerfen — Skalierung der Note-Discovery.
  encryptTo(recipientEncPubKeyHex) {
    if (typeof recipientEncPubKeyHex !== "string" || !/^[0-9a-f]{64}$/i.test(recipientEncPubKeyHex)) {
      throw new Error("recipient encryption key must be 32-byte hex");
    }
    const recipientPub = Uint8Array.from(Buffer.from(recipientEncPubKeyHex, "hex"));
    const eph = nacl.box.keyPair();
    const shared = nacl.box.before(recipientPub, eph.secretKey);
    const viewTag = viewTagFromShared(shared);
    const nonce = nacl.randomBytes(nacl.box.nonceLength);
    const msg = Buffer.from(JSON.stringify({ a: this.amount.toString(), b: this.blinding.toString() }));
    const box = nacl.box.after(msg, nonce, shared);
    return (
      "0x" +
      Buffer.concat([Buffer.from(eph.publicKey), Buffer.from([viewTag]), Buffer.from(nonce), Buffer.from(box)]).toString("hex")
    );
  }

  // Liest nur den View-Tag-Byte aus dem Memo (für Indexer/Filter, ohne Entschlüsselung).
  static viewTagOf(encHex) {
    const raw = Buffer.from(encHex.replace(/^0x/, ""), "hex");
    if (raw.length < 33) throw new Error("encrypted note too short");
    return raw[32];
  }

  // Schneller Tag-Check mit eigenem Viewing-Secret (true = Kandidat, lohnt Voll-Decrypt).
  static tagMatches(encHex, myEncSecretKey) {
    try {
      const raw = Buffer.from(encHex.replace(/^0x/, ""), "hex");
      if (raw.length < 33 + nacl.box.nonceLength + nacl.box.overheadLength) return null;
      const ephPub = raw.subarray(0, 32);
      const tag = raw[32];
      const shared = nacl.box.before(ephPub, myEncSecretKey);
      return viewTagFromShared(shared) === tag;
    } catch {
      return false;
    }
  }

  // Versucht, ein Memo mit dem eigenen Viewing-Secret zu entschlüsseln.
  // Erfolgreich → { amount, blinding }, sonst null. Nutzt zuerst den View-Tag.
  static tryDecrypt(encHex, myEncSecretKey) {
    try {
      const raw = Buffer.from(encHex.replace(/^0x/, ""), "hex");
      const ephPub = raw.subarray(0, 32);
      const tag = raw[32];
      const nonce = raw.subarray(33, 33 + nacl.box.nonceLength);
      const box = raw.subarray(33 + nacl.box.nonceLength);
      const shared = nacl.box.before(ephPub, myEncSecretKey);
      if (viewTagFromShared(shared) !== tag) return null; // schneller Reject
      const opened = nacl.box.open.after(box, nonce, shared);
      if (!opened) return null;
      const { a, b } = JSON.parse(Buffer.from(opened).toString());
      const amount = BigInt(a);
      if (amount < 0n || amount >= MAX_NOTE_AMOUNT) return null;
      return { amount, blinding: fieldElement(b, "decrypted note blinding") };
    } catch {
      return null;
    }
  }
}

function viewTagFromShared(shared) {
  return sha256(Buffer.from(shared))[0];
}
