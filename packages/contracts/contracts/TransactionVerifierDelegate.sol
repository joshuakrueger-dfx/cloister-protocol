// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces.sol";

/// @notice Adapts a gnark-exported bytes verifier supplied at deployment time to the
/// ShieldedPool's structured (a,b,c) verifier interface. Used by the dynamic ceremony
/// E2E gate so the committed verifier smoke tests and generated-key tests remain independent.
interface IGnarkBytesVerifier {
    function verifyProof(bytes calldata proof, uint256[10] calldata publicSignals) external view;
}

contract TransactionVerifierDelegate is ITransactionVerifier {
    address public immutable implementation;

    constructor(address _implementation) {
        require(_implementation != address(0), "implementation");
        implementation = _implementation;
    }

    function verifyProof(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[10] calldata pubSignals
    ) external view override returns (bool) {
        bytes memory proof = abi.encodePacked(
            a[0], a[1],
            b[0][0], b[0][1],
            b[1][0], b[1][1],
            c[0], c[1]
        );
        (bool ok,) = implementation.staticcall(
            abi.encodeWithSelector(IGnarkBytesVerifier.verifyProof.selector, proof, pubSignals)
        );
        return ok;
    }
}
