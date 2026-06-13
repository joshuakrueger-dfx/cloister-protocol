// BN254 scalar field — muss mit Circuit & Contract übereinstimmen.
export const FIELD_SIZE =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

// Zero-Leaf — leeres Blatt im Merkle-Tree. Im gnark-Schema schlicht 0 (ein echtes
// Commitment, das exakt zu 0 hasht, ist kryptografisch vernachlässigbar). MUSS mit
// zk.ZeroValue() (Go) und dem in-circuit H(0,0) übereinstimmen.
export const ZERO_VALUE = 0n;

// Merkle-Tiefe — identisch zu Transaction(20, ...) im Circuit & Pool-Deployment.
export const MERKLE_LEVELS = 20;
