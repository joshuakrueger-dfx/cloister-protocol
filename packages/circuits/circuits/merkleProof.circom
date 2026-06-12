pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/mux1.circom";
include "circomlib/circuits/bitify.circom";

// Poseidon Merkle-Membership-Proof. pathIndices ist als einzelnes Feld kodiert
// (LSB-first Bit i = Richtung auf Ebene i) und wird intern in Bits zerlegt.
template MerkleProof(levels) {
    signal input leaf;
    signal input pathIndices;
    signal input pathElements[levels];
    signal output root;

    component indexBits = Num2Bits(levels);
    indexBits.in <== pathIndices;

    component hashers[levels];
    component mux[levels];
    signal levelHash[levels + 1];
    levelHash[0] <== leaf;

    for (var i = 0; i < levels; i++) {
        // links/rechts tauschen je nach Richtungsbit
        mux[i] = MultiMux1(2);
        mux[i].c[0][0] <== levelHash[i];
        mux[i].c[0][1] <== pathElements[i];
        mux[i].c[1][0] <== pathElements[i];
        mux[i].c[1][1] <== levelHash[i];
        mux[i].s <== indexBits.out[i];

        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== mux[i].out[0];
        hashers[i].inputs[1] <== mux[i].out[1];
        levelHash[i + 1] <== hashers[i].out;
    }

    root <== levelHash[levels];
}
