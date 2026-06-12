import nacl from "tweetnacl";
import { randomBytes, sha256 } from "./cryptoShim.js";
import { poseidon } from "./poseidon.js";
import { getBabyjub } from "./curve.js";
import { FIELD_SIZE } from "./constants.js";

export function randomField() {
  // 31 zufällige Bytes liegen sicher < FIELD_SIZE
  return BigInt("0x" + randomBytes(31).toString("hex")) % FIELD_SIZE;
}

function to32Bytes(bigint) {
  return sha256(bigint.toString());
}

// Schlüsselpaar:
//  - spend: privateKey (Skalar), BabyJubJub-Pubkey (Ax,Ay) = privateKey·Base8,
//    Owner-Feld = publicKey = Poseidon(Ax,Ay) — geht in Circuit/Commitment ein
//  - viewing: nacl-box (x25519) Schlüsselpaar zum Ver-/Entschlüsseln von Note-Memos
export class Keypair {
  constructor(privateKey) {
    this.privateKey = privateKey ?? randomField();
    this.enc = nacl.box.keyPair.fromSecretKey(new Uint8Array(to32Bytes(this.privateKey)));
    this.publicKey = null; // async via derive()
    this.Ax = null;
    this.Ay = null;
  }

  async derive() {
    const bj = await getBabyjub();
    const pub = bj.mulPointEscalar(bj.Base8, this.privateKey);
    this.Ax = bj.F.toObject(pub[0]);
    this.Ay = bj.F.toObject(pub[1]);
    this.publicKey = await poseidon([this.Ax, this.Ay]);
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
}
