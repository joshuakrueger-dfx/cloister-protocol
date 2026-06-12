pragma circom 2.1.6;

include "transaction.circom";

// 2 Inputs / 2 Outputs, Merkle-Tiefe 20 (~1M Notes). Dummy-Zero-Inputs erlauben
// auch den 1-Input-Fall (Standardzahlung aus vorgeladenem Guthaben).
component main {public [root, publicAmount, extDataHash, inputNullifier, outputCommitment, newRoot, pairPathIndices]} = Transaction(20, 2, 2);
