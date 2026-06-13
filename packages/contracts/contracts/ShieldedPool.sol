// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
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
//
// Sicherheit (Audit-Härtung):
//   - ReentrancyGuard + strikte Checks-Effects-Interactions: der gesamte State (Nullifier, Root,
//     Index) wird VOR jedem Token-Transfer geschrieben, und Re-Entry ist zusätzlich geblockt →
//     ein Hook-fähiger Token (ERC-777/1363) kann den Pool nicht mit demselben Proof leersaugen.
//   - SafeERC20 für alle Transfers (USDT & Co. ohne bool-Return funktionieren).
//   - Deposit-Balance-Delta: gutgeschrieben wird nur, was wirklich ankam → Fee-on-Transfer-Tokens
//     können den Pool nicht unterdeckt machen (sie werden hart abgelehnt).
//   - Guardian kann ausschließlich EINZAHLUNGEN pausieren (Incident-Response); Auszahlungen
//     bleiben immer offen, Gelder können nie eingefroren werden.
contract ShieldedPool is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant FIELD_SIZE =
        21888242871839275222246405745257275088548364400416034343698204186575808495617;
    uint256 public constant MAX_EXT_AMOUNT = 2 ** 248;

    ITransactionVerifier public immutable verifier;
    IERC20 public immutable token;
    uint32 public immutable levels;
    uint32 public immutable numLanes;

    /// Guardian darf NUR Einzahlungen pausieren. Auszahlungen sind nie blockierbar.
    address public guardian;
    bool public depositsPaused;

    /// ASP (Association-Set-Provider, z.B. DFX): veröffentlicht die Roots des Good-Sets.
    /// Compliance-Schicht: jede Zahlung bindet im Proof eine `associationRoot`; der Pool
    /// akzeptiert nur Roots, die der ASP veröffentlicht hat. Der Good-Set wächst monoton,
    /// darum bleiben alte Roots gültig (ein Proof gegen eine ältere Root ist weiterhin
    /// „sauber", da älterer Set ⊂ neuerer Set) — das vermeidet Races mit Root-Updates.
    /// asp == address(0) ⇒ permissiver Dev-Modus (keine ASP-Erzwingung, für PoC-Demos).
    address public asp;
    uint256 public aspRoot; // zuletzt veröffentlichte Root (Info)
    mapping(uint256 => bool) public knownAspRoot;

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
    event DepositsPaused(bool paused);
    event GuardianTransferred(address indexed previousGuardian, address indexed newGuardian);
    event AspRootPublished(uint256 indexed root);
    event AspTransferred(address indexed previousAsp, address indexed newAsp);

    modifier onlyGuardian() {
        require(msg.sender == guardian, "only guardian");
        _;
    }

    modifier onlyAsp() {
        require(msg.sender == asp && asp != address(0), "only asp");
        _;
    }

    constructor(
        uint32 _levels,
        uint32 _numLanes,
        uint256 _initialRoot,
        ITransactionVerifier _verifier,
        IERC20 _token,
        address _guardian,
        address _asp,
        uint256 _initialAspRoot
    ) {
        require(_numLanes > 0, "numLanes");
        require(_levels > 0 && _levels <= 32, "levels");
        // Garantiert, dass der globale uint32-Leaf-Index nie überläuft/truncated:
        // max globaler Index = numLanes·2^levels - 1 muss in uint32 passen.
        require(uint256(_numLanes) << _levels <= uint256(type(uint32).max) + 1, "index space");
        require(address(_verifier) != address(0), "verifier");
        require(address(_token) != address(0), "token");
        require(_initialRoot < FIELD_SIZE, "initialRoot");

        levels = _levels;
        numLanes = _numLanes;
        verifier = _verifier;
        token = _token;
        guardian = _guardian; // address(0) => Pool ohne Pause-Fähigkeit
        asp = _asp; // address(0) => permissiver Dev-Modus (keine ASP-Erzwingung)
        if (_initialAspRoot != 0) {
            aspRoot = _initialAspRoot;
            knownAspRoot[_initialAspRoot] = true;
            emit AspRootPublished(_initialAspRoot);
        }
        for (uint32 i = 0; i < _numLanes; i++) laneRoot[i] = _initialRoot;
    }

    // ---------------- ASP (Compliance-Root-Pflege) ----------------

    /// Der ASP veröffentlicht eine neue Good-Set-Root. Monoton: alte Roots bleiben gültig.
    function publishAspRoot(uint256 root) external onlyAsp {
        require(root < FIELD_SIZE, "root range");
        aspRoot = root;
        knownAspRoot[root] = true;
        emit AspRootPublished(root);
    }

    function transferAsp(address newAsp) external onlyAsp {
        emit AspTransferred(asp, newAsp);
        asp = newAsp;
    }

    // Lane 0 (rückwärtskompatibel)
    function transact(
        Proof calldata proof,
        uint256 oldRoot,
        uint256 newRoot,
        uint256 associationRoot,
        uint256[2] calldata inputNullifiers,
        uint256[2] calldata outputCommitments,
        ExtData calldata extData
    ) external nonReentrant {
        _transact(0, proof, oldRoot, newRoot, associationRoot, inputNullifiers, outputCommitments, extData);
    }

    // Beliebige Lane (parallel)
    function transactLane(
        uint256 lane,
        Proof calldata proof,
        uint256 oldRoot,
        uint256 newRoot,
        uint256 associationRoot,
        uint256[2] calldata inputNullifiers,
        uint256[2] calldata outputCommitments,
        ExtData calldata extData
    ) external nonReentrant {
        require(lane < numLanes, "bad lane");
        _transact(lane, proof, oldRoot, newRoot, associationRoot, inputNullifiers, outputCommitments, extData);
    }

    function _transact(
        uint256 lane,
        Proof calldata proof,
        uint256 oldRoot,
        uint256 newRoot,
        uint256 associationRoot,
        uint256[2] calldata inputNullifiers,
        uint256[2] calldata outputCommitments,
        ExtData calldata extData
    ) internal {
        // ---------------- Checks ----------------
        require(oldRoot == laneRoot[lane], "stale or unknown root");
        // Lane-Kapazität: zwei Outputs müssen noch in den 2^levels-Blattraum dieser Lane
        // passen. Ohne diese Schranke würde eine volle Lane erst im (infeasiblen) Proof
        // scheitern; hier revertet sie sauber und früh.
        require(uint256(laneNextIndex[lane]) + 2 <= (uint256(1) << levels), "lane full");
        // Compliance: die im Proof gebundene Association-Root muss vom ASP stammen.
        // Permissiver Dev-Modus (asp==0) überspringt die Erzwingung.
        require(asp == address(0) || knownAspRoot[associationRoot], "unknown asp root");
        // Defense-in-depth: der Circuit erzwingt bereits paarweise verschiedene Nullifier,
        // aber falls der Verifier je kompromittiert wäre, verhindert dies einen In-Tx-Doppelspend.
        require(inputNullifiers[0] != inputNullifiers[1], "duplicate nullifier");
        require(!nullifierSpent[inputNullifiers[0]], "input 0 spent");
        require(!nullifierSpent[inputNullifiers[1]], "input 1 spent");

        if (extData.extAmount > 0) require(!depositsPaused, "deposits paused");

        uint256 extDataHash = uint256(keccak256(abi.encode(extData))) % FIELD_SIZE;
        uint256 publicAmount = _publicAmount(extData.extAmount, extData.fee);
        uint256 pairIndex = uint256(laneNextIndex[lane]) / 2;

        // Reihenfolge MUSS der Public-Signal-Reihenfolge des Circuits entsprechen
        // (associationRoot ist als letztes public-Signal deklariert → Index 9).
        uint256[10] memory pub = [
            oldRoot,
            publicAmount,
            extDataHash,
            inputNullifiers[0],
            inputNullifiers[1],
            outputCommitments[0],
            outputCommitments[1],
            newRoot,
            pairIndex,
            associationRoot
        ];
        require(verifier.verifyProof(proof.a, proof.b, proof.c, pub), "invalid proof");

        // ---------------- Effects (vor jedem externen Call) ----------------
        nullifierSpent[inputNullifiers[0]] = true;
        nullifierSpent[inputNullifiers[1]] = true;
        emit NewNullifier(inputNullifiers[0]);
        emit NewNullifier(inputNullifiers[1]);

        uint32 base = uint32(lane * (uint256(1) << levels) + uint256(laneNextIndex[lane]));
        emit NewCommitment(outputCommitments[0], base, extData.encryptedOutput1);
        emit NewCommitment(outputCommitments[1], base + 1, extData.encryptedOutput2);
        laneNextIndex[lane] += 2;
        laneRoot[lane] = newRoot;

        // ---------------- Interactions ----------------
        if (extData.extAmount > 0) {
            // Nur den TATSÄCHLICH erhaltenen Betrag akzeptieren → Fee-on-Transfer/Rebasing
            // können den Pool nicht unterdeckt machen (würden hier reverten).
            uint256 amount = uint256(extData.extAmount);
            uint256 balanceBefore = token.balanceOf(address(this));
            token.safeTransferFrom(msg.sender, address(this), amount);
            require(
                token.balanceOf(address(this)) - balanceBefore == amount,
                "fee-on-transfer unsupported"
            );
        } else if (extData.extAmount < 0) {
            require(extData.recipient != address(0), "recipient required");
            token.safeTransfer(extData.recipient, uint256(-extData.extAmount));
        }
        if (extData.fee > 0) {
            require(extData.relayer != address(0), "relayer required");
            token.safeTransfer(extData.relayer, extData.fee);
        }
    }

    function _publicAmount(int256 extAmount, uint256 fee) internal pure returns (uint256) {
        require(fee < MAX_EXT_AMOUNT, "fee too large");
        require(extAmount > -int256(MAX_EXT_AMOUNT) && extAmount < int256(MAX_EXT_AMOUNT), "extAmount range");
        int256 amount = extAmount - int256(fee);
        if (amount >= 0) return uint256(amount);
        return FIELD_SIZE - uint256(-amount);
    }

    // ---------------- Guardian (nur Einzahlungs-Pause) ----------------

    function setDepositsPaused(bool paused) external onlyGuardian {
        depositsPaused = paused;
        emit DepositsPaused(paused);
    }

    function transferGuardian(address newGuardian) external onlyGuardian {
        emit GuardianTransferred(guardian, newGuardian);
        guardian = newGuardian;
    }
}
