// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../interfaces.sol";

/// Verifier-Stub für Guard-Tests (akzeptiert jeden Proof). NUR für Tests.
contract MockVerifier is ITransactionVerifier {
    function verifyProof(
        uint256[2] calldata,
        uint256[2][2] calldata,
        uint256[2] calldata,
        uint256[10] calldata
    ) external pure returns (bool) {
        return true;
    }
}

/// Fee-on-Transfer-Token: behält 1% bei jedem Transfer ein.
contract FeeOnTransferToken is ERC20 {
    constructor() ERC20("Fee", "FEE") {
        _mint(msg.sender, 1_000_000 ether);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            uint256 fee = value / 100;
            super._update(from, address(0xdEaD), fee);
            super._update(from, to, value - fee);
        } else {
            super._update(from, to, value);
        }
    }
}

/// USDT-artig: transfer/transferFrom geben KEIN bool zurück (Standard-IERC20 bricht daran,
/// SafeERC20 nicht).
contract NoReturnToken {
    string public name = "NoReturn";
    string public symbol = "NRT";
    uint8 public decimals = 18;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    constructor() {
        balanceOf[msg.sender] = 1_000_000 ether;
    }

    function approve(address s, uint256 a) external {
        allowance[msg.sender][s] = a;
    }

    function transfer(address to, uint256 a) external {
        balanceOf[msg.sender] -= a;
        balanceOf[to] += a;
    }

    function transferFrom(address f, address t, uint256 a) external {
        allowance[f][msg.sender] -= a;
        balanceOf[f] -= a;
        balanceOf[t] += a;
    }
}

interface IPoolReenter {
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

    function transact(
        Proof calldata proof,
        uint256 oldRoot,
        uint256 newRoot,
        uint256 associationRoot,
        uint256[2] calldata inputNullifiers,
        uint256[2] calldata outputCommitments,
        ExtData calldata extData
    ) external;
}

/// Hook-fähiger Token (ERC-777-artig): ruft beim Transfer in einen Empfänger den hinterlegten
/// Re-Entry-Call auf den Pool auf — um zu beweisen, dass der ReentrancyGuard greift.
contract ReentrantToken is ERC20 {
    address public pool;
    bytes public payload; // abi.encodeWithSelector(transact, ...)
    bool public armed;
    bool public reentryReverted;

    constructor() ERC20("Reenter", "RNT") {
        _mint(msg.sender, 1_000_000 ether);
    }

    function setAttack(address _pool, bytes calldata _payload) external {
        pool = _pool;
        payload = _payload;
        armed = true;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (armed && to != address(0) && to != pool && from == pool) {
            armed = false; // einmalig, sonst Endlos-Rekursion
            (bool ok, ) = pool.call(payload);
            reentryReverted = !ok; // true = Guard hat geblockt
        }
    }
}
