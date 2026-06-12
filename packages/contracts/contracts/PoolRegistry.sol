// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";

// Registry chainId+asset → Pool/Verifier. Ermöglicht, dass mehrere Wallets/PSPs denselben
// kanonischen Pool teilen (ARCHITECTURE §8, CONCEPT §12.4).
//
// Härtung: 2-Step-Ownership, Zero-Adress-Checks, append-only `register` (eine Erst-Eintragung
// kann nicht still überschrieben werden) und ein separates `migrate`, das old+new emittiert →
// jedes Umbiegen ist on-chain sichtbar und für Wallets/Watcher detektierbar.
// In Produktion MUSS der Owner ein Multisig + Timelock sein.
contract PoolRegistry is Ownable2Step {
    struct PoolInfo {
        address pool;
        address verifier;
        address token;
        uint32 levels;
    }

    // keccak256(chainId, assetSymbol) => PoolInfo
    mapping(bytes32 => PoolInfo) public pools;

    event PoolRegistered(
        uint256 indexed chainId,
        string asset,
        address pool,
        address verifier,
        address token,
        uint32 levels
    );
    event PoolMigrated(uint256 indexed chainId, string asset, address oldPool, address newPool);

    constructor() Ownable(msg.sender) {}

    function key(uint256 chainId, string calldata asset) public pure returns (bytes32) {
        return keccak256(abi.encode(chainId, asset));
    }

    /// Erst-Registrierung. Schlägt fehl, wenn der Slot bereits belegt ist (kein stilles Überschreiben).
    function register(
        uint256 chainId,
        string calldata asset,
        address pool,
        address verifier,
        address token,
        uint32 levels
    ) external onlyOwner {
        require(pool != address(0) && verifier != address(0) && token != address(0), "zero addr");
        bytes32 k = key(chainId, asset);
        require(pools[k].pool == address(0), "already registered");
        pools[k] = PoolInfo(pool, verifier, token, levels);
        emit PoolRegistered(chainId, asset, pool, verifier, token, levels);
    }

    /// Bewusstes Umbiegen eines bestehenden Eintrags — emittiert old+new, damit es sichtbar ist.
    function migrate(
        uint256 chainId,
        string calldata asset,
        address pool,
        address verifier,
        address token,
        uint32 levels
    ) external onlyOwner {
        require(pool != address(0) && verifier != address(0) && token != address(0), "zero addr");
        bytes32 k = key(chainId, asset);
        address old = pools[k].pool;
        require(old != address(0), "not registered");
        pools[k] = PoolInfo(pool, verifier, token, levels);
        emit PoolMigrated(chainId, asset, old, pool);
        emit PoolRegistered(chainId, asset, pool, verifier, token, levels);
    }

    function get(uint256 chainId, string calldata asset) external view returns (PoolInfo memory) {
        return pools[key(chainId, asset)];
    }
}
