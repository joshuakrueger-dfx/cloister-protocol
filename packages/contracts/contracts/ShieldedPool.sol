// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces.sol";

// Compliant encrypted-UTXO Shielded Pool — Off-chain-Insertion + Lane-Parallelisierung.
//
// Off-chain-Insertion: die Merkle-Root-Transition oldRoot→newRoot wird im zk-Proof bewiesen,
// der Contract rechnet KEIN Poseidon → ~5× weniger Gas.
//
// Lane-Parallelisierung: statt einer globalen Root hält der Pool `numLanes` UNABHÄNGIGE Roots.
// Transaktionen in verschiedenen Lanes bauen auf verschiedene Roots auf → sie kollidieren NICHT
// und können parallel im selben Block landen. Nur Txs in derselben Lane serialisieren.
// Der Nullifier-Set ist global (Double-Spend lane-übergreifend verhindert).
// Globaler Leaf-Index = lane·2^levels + lokalIndex (Lane 0 ⇒ Index == lokal, rückwärtskompatibel).
contract ShieldedPool {
    uint256 public constant FIELD_SIZE =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256 public constant MAX_EXT_AMOUNT = 2 ** 248;

    ITransactionVerifier public immutable verifier;
    IERC20Min public immutable token;
    uint32 public immutable levels;
    uint32 public immutable numLanes;

    mapping(uint256 => uint256) public laneRoot; // lane => aktuelle Root
    mapping(uint256 => uint32) public laneNextIndex; // lane => nächster lokaler Leaf-Index
    mapping(uint256 => bool) public nullifierSpent; // global

    struct Proof {
        uint256[2] a;
        uint256[2][2] b;
        uint256[2] c;
    }

    struct ExtData {
        address recipient;
        int256 extAmount;
        address relayer;
        uint256 fee;
        bytes encryptedOutput1;
        bytes encryptedOutput2;
    }

    event NewCommitment(uint256 indexed commitment, uint32 leafIndex, bytes encryptedOutput);
    event NewNullifier(uint256 indexed nullifier);

    constructor(
        uint32 _levels,
        uint32 _numLanes,
        uint256 _initialRoot,
        ITransactionVerifier _verifier,
        IERC20Min _token
    ) {
        require(_numLanes > 0, "numLanes");
        levels = _levels;
        numLanes = _numLanes;
        verifier = _verifier;
        token = _token;
        for (uint32 i = 0; i < _numLanes; i++) laneRoot[i] = _initialRoot;
    }

    // Lane 0 (rückwärtskompatibel)
    function transact(
        Proof calldata proof,
        uint256 oldRoot,
        uint256 newRoot,
        uint256[2] calldata inputNullifiers,
        uint256[2] calldata outputCommitments,
        ExtData calldata extData
    ) external {
        _transact(0, proof, oldRoot, newRoot, inputNullifiers, outputCommitments, extData);
    }

    // Beliebige Lane (parallel)
    function transactLane(
        uint256 lane,
        Proof calldata proof,
        uint256 oldRoot,
        uint256 newRoot,
        uint256[2] calldata inputNullifiers,
        uint256[2] calldata outputCommitments,
        ExtData calldata extData
    ) external {
        require(lane < numLanes, "bad lane");
        _transact(lane, proof, oldRoot, newRoot, inputNullifiers, outputCommitments, extData);
    }

    function _transact(
        uint256 lane,
        Proof calldata proof,
        uint256 oldRoot,
        uint256 newRoot,
        uint256[2] calldata inputNullifiers,
        uint256[2] calldata outputCommitments,
        ExtData calldata extData
    ) internal {
        require(oldRoot == laneRoot[lane], "stale or unknown root");
        require(!nullifierSpent[inputNullifiers[0]], "input 0 spent");
        require(!nullifierSpent[inputNullifiers[1]], "input 1 spent");

        uint256 extDataHash = uint256(keccak256(abi.encode(extData))) % FIELD_SIZE;
        uint256 publicAmount = _publicAmount(extData.extAmount, extData.fee);
        uint256 pairIndex = uint256(laneNextIndex[lane]) / 2;

        uint256[9] memory pub = [
            oldRoot,
            publicAmount,
            extDataHash,
            inputNullifiers[0],
            inputNullifiers[1],
            outputCommitments[0],
            outputCommitments[1],
            newRoot,
            pairIndex
        ];
        require(verifier.verifyProof(proof.a, proof.b, proof.c, pub), "invalid proof");

        if (extData.extAmount > 0) {
            require(token.transferFrom(msg.sender, address(this), uint256(extData.extAmount)), "deposit failed");
        } else if (extData.extAmount < 0) {
            require(extData.recipient != address(0), "recipient required");
            require(token.transfer(extData.recipient, uint256(-extData.extAmount)), "withdraw failed");
        }
        if (extData.fee > 0) {
            require(extData.relayer != address(0), "relayer required");
            require(token.transfer(extData.relayer, extData.fee), "fee failed");
        }

        nullifierSpent[inputNullifiers[0]] = true;
        nullifierSpent[inputNullifiers[1]] = true;
        emit NewNullifier(inputNullifiers[0]);
        emit NewNullifier(inputNullifiers[1]);

        uint32 base = uint32(lane * (uint256(1) << levels) + uint256(laneNextIndex[lane]));
        emit NewCommitment(outputCommitments[0], base, extData.encryptedOutput1);
        emit NewCommitment(outputCommitments[1], base + 1, extData.encryptedOutput2);
        laneNextIndex[lane] += 2;
        laneRoot[lane] = newRoot;
    }

    function _publicAmount(int256 extAmount, uint256 fee) internal pure returns (uint256) {
        require(fee < MAX_EXT_AMOUNT, "fee too large");
        require(extAmount > -int256(MAX_EXT_AMOUNT) && extAmount < int256(MAX_EXT_AMOUNT), "extAmount range");
        int256 amount = extAmount - int256(fee);
        if (amount >= 0) return uint256(amount);
        return FIELD_SIZE - uint256(-amount);
    }
}
