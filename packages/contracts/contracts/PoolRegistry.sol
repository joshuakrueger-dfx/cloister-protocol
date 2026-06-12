// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Registry chainId+asset → Pool/Verifier. Ermöglicht, dass mehrere Wallets/PSPs
// denselben kanonischen Pool teilen (ARCHITECTURE §8, CONCEPT §12.4).
contract PoolRegistry {
    struct PoolInfo {
        address pool;
        address verifier;
        address token;
        uint32 levels;
    }

    address public owner;
    // keccak256(chainId, assetSymbol) => PoolInfo
    mapping(bytes32 => PoolInfo) public pools;

    event PoolRegistered(uint256 indexed chainId, string asset, address pool, address token);

    constructor() {
        owner = msg.sender;
    }

    function key(uint256 chainId, string calldata asset) public pure returns (bytes32) {
        return keccak256(abi.encode(chainId, asset));
    }

    function register(
        uint256 chainId,
        string calldata asset,
        address pool,
        address verifier,
        address token,
        uint32 levels
    ) external {
        require(msg.sender == owner, "only owner");
        pools[key(chainId, asset)] = PoolInfo(pool, verifier, token, levels);
        emit PoolRegistered(chainId, asset, pool, token);
    }

    function get(uint256 chainId, string calldata asset) external view returns (PoolInfo memory) {
        return pools[key(chainId, asset)];
    }
}
