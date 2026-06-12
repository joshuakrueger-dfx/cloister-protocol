pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/bitify.circom";
include "merkleProof.circom";
include "keypair.circom";

// Kern-Transaktion des Shielded Pools (encrypted-UTXO, ARCHITECTURE §4).
//
// Note-Commitment:  Poseidon(amount, pubKey, blinding)
// Nullifier:        Poseidon(commitment, pathIndices, Signature(privKey, commitment, pathIndices))
//
// publicAmount (feld-kodiert, signed):
//   Shield/Deposit   = +betrag        (keine echten Inputs → Dummy-Zero-Inputs)
//   interne Zahlung  =  0             (voll abgeschirmt: Input-Notes → Payment-Note + Change-Note)
//   Unshield/Auszahl = p - betrag     (negativ im Feld)
//
// extDataHash bindet Off-Circuit-Daten (Empfänger-Adresse, Relayer, Fee) → Relayer
// kann Ziel/Betrag der On-chain-Auszahlung nicht manipulieren.
template Transaction(levels, nIns, nOuts) {
    // Off-chain-Insertion: Zero-Leaf-Konstante (identisch zu Contract/SDK ZERO_VALUE)
    var ZERO_VALUE = 21663839004416932945382355908790599225266501822907911457504978515578255421292;

    // ---- public ----
    signal input root;            // oldRoot (auch für Input-Membership)
    signal input publicAmount;
    signal input extDataHash;
    signal input inputNullifier[nIns];
    signal input outputCommitment[nOuts];
    signal input newRoot;         // Root nach Einfügen der 2 Outputs (als Paar-Knoten)
    signal input pairPathIndices; // Position des Paar-Knotens (= nextLeafIndex/2)

    // ---- private: insertion ----
    signal input pairPathElements[levels - 1];

    // ---- private: inputs ----
    signal input inAmount[nIns];
    signal input inPrivateKey[nIns];
    signal input inBlinding[nIns];
    signal input inPathIndices[nIns];
    signal input inPathElements[nIns][levels];

    // ---- private: outputs ----
    signal input outAmount[nOuts];
    signal input outPubkey[nOuts];
    signal input outBlinding[nOuts];

    component inKeypair[nIns];
    component inSig[nIns];
    component inCommit[nIns];
    component inNull[nIns];
    component inTree[nIns];
    component inCheckRoot[nIns];
    component inRange[nIns];

    var sumIn = 0;

    for (var t = 0; t < nIns; t++) {
        inKeypair[t] = Keypair();
        inKeypair[t].privateKey <== inPrivateKey[t];

        inCommit[t] = Poseidon(3);
        inCommit[t].inputs[0] <== inAmount[t];
        inCommit[t].inputs[1] <== inKeypair[t].publicKey;
        inCommit[t].inputs[2] <== inBlinding[t];

        // Ownership-Signatur
        inSig[t] = Signature();
        inSig[t].privateKey <== inPrivateKey[t];
        inSig[t].commitment <== inCommit[t].out;
        inSig[t].merklePath <== inPathIndices[t];

        // Nullifier muss zum öffentlich angegebenen passen
        inNull[t] = Poseidon(3);
        inNull[t].inputs[0] <== inCommit[t].out;
        inNull[t].inputs[1] <== inPathIndices[t];
        inNull[t].inputs[2] <== inSig[t].out;
        inNull[t].out === inputNullifier[t];

        // Merkle-Membership
        inTree[t] = MerkleProof(levels);
        inTree[t].leaf <== inCommit[t].out;
        inTree[t].pathIndices <== inPathIndices[t];
        for (var i = 0; i < levels; i++) {
            inTree[t].pathElements[i] <== inPathElements[t][i];
        }
        // nur für echte (betrag>0) Inputs erzwingen → Dummy-Zero-Inputs erlaubt
        inCheckRoot[t] = ForceEqualIfEnabled();
        inCheckRoot[t].in[0] <== root;
        inCheckRoot[t].in[1] <== inTree[t].root;
        inCheckRoot[t].enabled <== inAmount[t];

        // Range-Check verhindert Feld-Overflow-Tricks bei der Summe
        inRange[t] = Num2Bits(248);
        inRange[t].in <== inAmount[t];

        sumIn += inAmount[t];
    }

    component outCommit[nOuts];
    component outRange[nOuts];
    var sumOut = 0;

    for (var t = 0; t < nOuts; t++) {
        outCommit[t] = Poseidon(3);
        outCommit[t].inputs[0] <== outAmount[t];
        outCommit[t].inputs[1] <== outPubkey[t];
        outCommit[t].inputs[2] <== outBlinding[t];
        outCommit[t].out === outputCommitment[t];

        outRange[t] = Num2Bits(248);
        outRange[t].in <== outAmount[t];

        sumOut += outAmount[t];
    }

    // Nullifier paarweise verschieden (kein Self-Double-Spend innerhalb der Tx)
    var pairs = nIns * (nIns - 1) \ 2;
    if (pairs > 0) {
        component sameNull[pairs];
        var idx = 0;
        for (var i = 0; i < nIns - 1; i++) {
            for (var j = i + 1; j < nIns; j++) {
                sameNull[idx] = IsEqual();
                sameNull[idx].in[0] <== inputNullifier[i];
                sameNull[idx].in[1] <== inputNullifier[j];
                sameNull[idx].out === 0;
                idx++;
            }
        }
    }

    // Werterhaltung: sumIn + publicAmount === sumOut  (im Feld)
    sumIn + publicAmount === sumOut;

    // --- Off-chain Insertion: 2 Outputs als Paar-Knoten (Ebene 1) einfügen ---
    // Beweist oldRoot→newRoot, sodass der Contract KEIN Poseidon on-chain rechnen muss.
    component z1 = Poseidon(2);
    z1.inputs[0] <== ZERO_VALUE;
    z1.inputs[1] <== ZERO_VALUE;

    component pairNode = Poseidon(2);
    pairNode.inputs[0] <== outputCommitment[0];
    pairNode.inputs[1] <== outputCommitment[1];

    // oldRoot: der Paar-Slot ist aktuell leer (= z1)
    component oldPair = MerkleProof(levels - 1);
    oldPair.leaf <== z1.out;
    oldPair.pathIndices <== pairPathIndices;
    for (var i = 0; i < levels - 1; i++) oldPair.pathElements[i] <== pairPathElements[i];
    oldPair.root === root;

    // newRoot: nach Einfügen des Paar-Knotens
    component newPair = MerkleProof(levels - 1);
    newPair.leaf <== pairNode.out;
    newPair.pathIndices <== pairPathIndices;
    for (var i = 0; i < levels - 1; i++) newPair.pathElements[i] <== pairPathElements[i];
    newPair.root === newRoot;

    // extDataHash in einen Constraint zwingen, damit es nicht wegoptimiert wird
    signal extDataSquare;
    extDataSquare <== extDataHash * extDataHash;
}
