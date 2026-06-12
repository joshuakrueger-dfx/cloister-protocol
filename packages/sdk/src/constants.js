// BN254 scalar field — muss mit Circuit & Contract übereinstimmen.
export const FIELD_SIZE =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

// Zero-Leaf — MUSS identisch zu MerkleTreeWithHistory.ZERO_VALUE im Contract sein.
export const ZERO_VALUE =
  21663839004416932945382355908790599225266501822907911457504978515578255421292n;

// Merkle-Tiefe — identisch zu Transaction(20, ...) im Circuit & Pool-Deployment.
export const MERKLE_LEVELS = 20;
