// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Groth16Verifier} from "./Groth16Verifier.sol";
import {ITransactionVerifier} from "./interfaces.sol";

/// @title Cloister transaction verifier
/// @notice Adapts the gnark-exported Groth16 verifier (which takes a 256-byte
///         `bytes` proof and reverts on failure) to the (a,b,c) struct interface the
///         ShieldedPool consumes. The eight proof words are re-packed in the exact
///         MarshalSolidity order the gnark prover emits, so on-chain verification is
///         byte-identical to the native gnark verifier — no semantic re-ordering.
/// @dev    Fully MIT-licensed (gnark template, Apache-2 compatible). Replaces the
///         former GPL-3.0 snarkjs-generated verifier.
contract TransactionVerifier is Groth16Verifier, ITransactionVerifier {
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
        // Inherited gnark verifier reverts on an invalid proof; translate to bool
        // so the ShieldedPool's `require(verifier.verifyProof(...))` semantics hold.
        try this.verifyProof(proof, pubSignals) {
            return true;
        } catch {
            return false;
        }
    }
}
