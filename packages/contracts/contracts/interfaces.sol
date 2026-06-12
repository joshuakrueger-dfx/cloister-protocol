// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IHasher {
    function poseidon(uint256[2] calldata input) external pure returns (uint256);
}

interface ITransactionVerifier {
    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[9] calldata pubSignals
    ) external view returns (bool);
}

interface IERC20Min {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}
