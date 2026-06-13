import nacl from "tweetnacl";
import { sha512 } from "@noble/hashes/sha2.js";
import { generateMnemonic as bip39Generate, mnemonicToSeedSync, validateMnemonic as bip39Validate } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { randomBytes, sha256 } from "./cryptoShim.js";
import { poseidon } from "./poseidon.js";
import { FIELD_SIZE } from "./constants.js";

// Im gnark-Schema ist der Spend-Schlüssel ein reines Feld-Element und der Public-Key
// ist H(privateKey) (KEINE Kurve mehr). Damit entfällt die BabyJubJub-Untergruppen-
// ordnung samt zugehöriger Self-Double-Spend-Klasse strukturell. Die Konstante bleibt
// nur als (historische) Skalar-Schranke exportiert, um die API stabil zu halten.
export const SUBGROUP_ORDER =
  2736030358979909402780800718157159386076813972158567259200215660948447373041n;

export function randomField() {
  // 31 zufällige Bytes liegen sicher < FIELD_SIZE
  return BigInt("0x" + randomBytes(31).toString("hex")) % FIELD_SIZE;
}

// 24-Wort-BIP39-Mnemonic (256 bit Entropie).
export function generateMnemonic() {
  return bip39Generate(wordlist, 256);
}

export function validateMnemonic(mnemonic) {
  return bip39Validate(mnemonic, wordlist);
}

// Deterministische Ableitung des Spend-Skalars aus einer Seed-Phrase.
// seed = BIP39(mnemonic); privKey = sha512(seed || "cloister-spend" || account) mod SUBGROUP_ORDER.
// Der Viewing-(nacl-)Key wird im Keypair-Konstruktor aus privKey abgeleitet → ein Seed,
// vollständige Recovery (Spend + View) ohne Extra-Backup.
export function spendKeyFromMnemonic(mnemonic, account = 0) {
  if (!validateMnemonic(mnemonic)) throw new Error("invalid mnemonic");
  const seed = mnemonicToSeedSync(mnemonic); // 64 Bytes
  const tag = new TextEncoder().encode(`cloister-spend:${account}`);
  const material = new Uint8Array(seed.length + tag.length);
  material.set(seed, 0);
  material.set(tag, seed.length);
  const h = sha512(material); // 64 Bytes
  const scalar = BigInt("0x" + Buffer.from(h).toString("hex")) % SUBGROUP_ORDER;
  // 0 ausschließen (degeneriert)
  return scalar === 0n ? 1n : scalar;
}

function to32Bytes(bigint) {
  return sha256(bigint.toString());
}

// Schlüsselpaar:
//  - spend: privateKey (Feld-Element), Owner-Feld = publicKey = Poseidon2(privateKey)
//    — kurvenfrei, geht direkt in Circuit/Commitment ein
//  - viewing: nacl-box (x25519) Schlüsselpaar zum Ver-/Entschlüsseln von Note-Memos
export class Keypair {
  constructor(privateKey) {
    this.privateKey = privateKey ?? randomField();
    this.enc = nacl.box.keyPair.fromSecretKey(new Uint8Array(to32Bytes(this.privateKey)));
    this.publicKey = null; // async via derive()
  }

  // publicKey = H(privateKey) — identisch zu zk.PubKey(priv) (Go) und der
  // In-Circuit-Berechnung h(InPrivateKey) in TxCircuit.Define.
  async derive() {
    this.publicKey = await poseidon([this.privateKey]);
    return this;
  }

  // teilbare Shielded-Address (kein Spend-Recht)
  address() {
    if (this.publicKey === null) throw new Error("call derive() first");
    return {
      pubKey: this.publicKey,
      encPubKey: Buffer.from(this.enc.publicKey).toString("hex"),
    };
  }

  static async create(privateKey) {
    return new Keypair(privateKey).derive();
  }

  // Aus Seed-Phrase (self-custody Recovery).
  static async fromMnemonic(mnemonic, account = 0) {
    return Keypair.create(spendKeyFromMnemonic(mnemonic, account));
  }
}
