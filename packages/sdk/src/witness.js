import { AbiCoder, keccak256, ZeroAddress } from "ethers";
import { poseidon } from "./poseidon.js";
import { Note } from "./note.js";
import { Keypair, randomField } from "./keypair.js";
import { FIELD_SIZE } from "./constants.js";

// Reine Witness-Bau-Logik. Das Proven übernimmt das Backend (nativer gnark-Prover auf
// dem Gerät bzw. proverd in Node/Dev) — siehe backend.js. Kein snarkjs/circom mehr.

const EXT_DATA_ABI =
  "tuple(address recipient,int256 extAmount,address relayer,uint256 fee,bytes encryptedOutput1,bytes encryptedOutput2)";

export async function noteNullifier(commitment, pathIndices, privateKey) {
  const sig = await poseidon([privateKey, commitment, pathIndices]);
  return poseidon([commitment, pathIndices, sig]);
}

export function encodeExtData(extData) {
  const coder = AbiCoder.defaultAbiCoder();
  const encoded = coder.encode(
    [EXT_DATA_ABI],
    [[extData.recipient, extData.extAmount, extData.relayer, extData.fee, extData.encryptedOutput1, extData.encryptedOutput2]],
  );
  return BigInt(keccak256(encoded)) % FIELD_SIZE;
}

function fieldSigned(value) {
  const v = BigInt(value);
  return v < 0n ? FIELD_SIZE + v : v;
}

// Legacy-Helper: snarkjs-Proof-Objekt → Solidity-Calldata (a,b,c). Der gnark-Prover
// liefert (a,b,c) bereits direkt; nur für Altpfade/Tests beibehalten.
export function toSolidityProof(proof) {
  return {
    a: [proof.pi_a[0], proof.pi_a[1]],
    b: [
      [proof.pi_b[0][1], proof.pi_b[0][0]],
      [proof.pi_b[1][1], proof.pi_b[1][0]],
    ],
    c: [proof.pi_c[0], proof.pi_c[1]],
  };
}

// Baut den 2-in/2-out Witness (ohne Proven). inputs/outputs werden auf 2 gepaddet.
export async function buildWitness({
  tree,
  lane = 0,
  inputs = [],
  outputs = [],
  extAmount = 0n,
  fee = 0n,
  recipient = ZeroAddress,
  relayer = ZeroAddress,
  // Compliance: ASP-Good-Set (Merkle-Tree der vom ASP freigegebenen Commitments).
  // Default = der Pool-Tree selbst (jedes On-chain-Commitment gilt als „assoziiert" —
  // rückwärtskompatibel zu den PoC-Demos). Die App übergibt einen kuratierten aspTree.
  aspTree = null,
  associationRoot = null,
}) {
  const root = await tree.root();
  const asp = aspTree || tree;
  const aspRootValue = associationRoot != null ? BigInt(associationRoot) : await asp.root();

  const inAmount = [];
  const inPrivateKey = [];
  const inBlinding = [];
  const inPathIndices = [];
  const inPathElements = [];
  const inAspPathIndices = [];
  const inAspPathElements = [];
  const inputNullifiers = [];

  for (let i = 0; i < 2; i++) {
    if (i < inputs.length) {
      const { note, privateKey, index, aspIndex } = inputs[i];
      const commitment = await note.commitment();
      const { pathElements, pathIndices } = await tree.path(index);
      // ASP-Inclusion-Pfad: Position des Commitments im Good-Set (Default = Pool-Index).
      const aspPath = await asp.path(aspIndex != null ? aspIndex : index);
      inAmount.push(note.amount);
      inPrivateKey.push(privateKey);
      inBlinding.push(note.blinding);
      inPathIndices.push(pathIndices);
      inPathElements.push(pathElements);
      inAspPathIndices.push(aspPath.pathIndices);
      inAspPathElements.push(aspPath.pathElements);
      inputNullifiers.push(await noteNullifier(commitment, pathIndices, privateKey));
    } else {
      const pk = randomField();
      const kp = await Keypair.create(pk);
      const note = new Note({ amount: 0n, pubKey: kp.publicKey, blinding: randomField() });
      const commitment = await note.commitment();
      const pathIndices = 0n;
      inAmount.push(0n);
      inPrivateKey.push(pk);
      inBlinding.push(note.blinding);
      inPathIndices.push(pathIndices);
      inPathElements.push(tree.zeros.slice(0, tree.levels));
      // Dummy-Input: ASP-Check ist disabled (enabled=amount=0) → Pfad-Werte irrelevant.
      inAspPathIndices.push(0n);
      inAspPathElements.push(asp.zeros.slice(0, asp.levels));
      inputNullifiers.push(await noteNullifier(commitment, pathIndices, pk));
    }
  }

  const outAmount = [];
  const outPubkey = [];
  const outBlinding = [];
  const outputCommitments = [];
  const encryptedOutputs = [];
  const outNotes = [];

  for (let i = 0; i < 2; i++) {
    if (i < outputs.length) {
      const { note, encPubKey } = outputs[i];
      outAmount.push(note.amount);
      outPubkey.push(note.pubKey);
      outBlinding.push(note.blinding);
      outputCommitments.push(await note.commitment());
      encryptedOutputs.push(note.encryptTo(encPubKey));
      outNotes.push(note);
    } else {
      const kp = await Keypair.create(randomField());
      const note = new Note({ amount: 0n, pubKey: kp.publicKey, blinding: randomField() });
      outAmount.push(0n);
      outPubkey.push(note.pubKey);
      outBlinding.push(note.blinding);
      outputCommitments.push(await note.commitment());
      encryptedOutputs.push("0x");
      outNotes.push(note);
    }
  }

  const extData = {
    recipient,
    extAmount: extAmount.toString(),
    relayer,
    fee: fee.toString(),
    encryptedOutput1: encryptedOutputs[0],
    encryptedOutput2: encryptedOutputs[1],
  };
  const extDataHash = encodeExtData(extData);
  const publicAmount = fieldSigned(BigInt(extAmount) - BigInt(fee));

  const pairIndex = tree.leaves.length / 2;
  const { pathElements: pairPathElements, pathIndices: pairPathIndices } = await tree.pairPath(pairIndex);
  const newRoot = await tree.rootWith([outputCommitments[0], outputCommitments[1]]);

  const s = (x) => x.toString();
  const witnessInput = {
    root: s(root),
    publicAmount: s(publicAmount),
    extDataHash: s(extDataHash),
    inputNullifier: inputNullifiers.map(s),
    outputCommitment: outputCommitments.map(s),
    newRoot: s(newRoot),
    pairPathIndices: s(pairPathIndices),
    associationRoot: s(aspRootValue),
    pairPathElements: pairPathElements.map(s),
    inAspPathIndices: inAspPathIndices.map(s),
    inAspPathElements: inAspPathElements.map((arr) => arr.map(s)),
    inAmount: inAmount.map(s),
    inPrivateKey: inPrivateKey.map(s),
    inBlinding: inBlinding.map(s),
    inPathIndices: inPathIndices.map(s),
    inPathElements: inPathElements.map((arr) => arr.map(s)),
    outAmount: outAmount.map(s),
    outPubkey: outPubkey.map(s),
    outBlinding: outBlinding.map(s),
  };

  return {
    witnessInput,
    lane,
    root: root.toString(),
    newRoot: newRoot.toString(),
    pairPathIndices: pairPathIndices.toString(),
    associationRoot: aspRootValue.toString(),
    inputNullifiers: inputNullifiers.map(s),
    outputCommitments: outputCommitments.map(s),
    extData,
    outNotes,
  };
}
