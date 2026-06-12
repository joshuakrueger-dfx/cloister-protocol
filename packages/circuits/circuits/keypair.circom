pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/babyjub.circom";
include "circomlib/circuits/comparators.circom";

// BabyJubJub-Untergruppenordnung (Ordnung des Base8-Punkts).
function SUBGROUP_ORDER() {
    return 2736030358979909402780800718157159386076813972158567259200215660948447373041;
}

// Schlüsselmodell: echter BabyJubJub-Public-Key (Ax,Ay) = privateKey · Base8,
// Owner-Feld der Note = Poseidon(Ax, Ay). Ownership = Beweis der Kenntnis des Skalars.
//
// SICHERHEIT: privateKey wird auf < Untergruppenordnung beschränkt. Ohne diese Schranke
// ergäben s und s+order denselben Punkt (→ denselben Commitment), aber — weil der Nullifier
// den ROHEN Skalar hasht — VERSCHIEDENE Nullifier. Da der Contract Nullifier (nicht Commitments)
// trackt, könnte dieselbe Note sonst zweimal ausgegeben werden (Self-Double-Spend = Mint).
template Keypair() {
    signal input privateKey;
    signal output publicKey;

    component lt = LessThan(252);
    lt.in[0] <== privateKey;
    lt.in[1] <== SUBGROUP_ORDER();
    lt.out === 1;

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
