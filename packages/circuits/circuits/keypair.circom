pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/babyjub.circom";

// Schlüsselmodell: echter BabyJubJub-Public-Key (Ax,Ay) = privateKey · Base8,
// Owner-Feld der Note = Poseidon(Ax, Ay). Ownership = Beweis der Kenntnis des Skalars.
// (privateKey < 2^253; SDK nutzt 248-Bit-Skalare.)
template Keypair() {
    signal input privateKey;
    signal output publicKey;

    component pbk = BabyPbk();
    pbk.in <== privateKey;

    component h = Poseidon(2);
    h.inputs[0] <== pbk.Ax;
    h.inputs[1] <== pbk.Ay;
    publicKey <== h.out;
}

// Bindet den Spend an den privaten Schlüssel: signature = Poseidon(privKey, commitment, pathIndices).
// Geht in den Nullifier ein → nur der Eigentümer kann einen gültigen Nullifier erzeugen.
template Signature() {
    signal input privateKey;
    signal input commitment;
    signal input merklePath;
    signal output out;

    component h = Poseidon(3);
    h.inputs[0] <== privateKey;
    h.inputs[1] <== commitment;
    h.inputs[2] <== merklePath;
    out <== h.out;
}
