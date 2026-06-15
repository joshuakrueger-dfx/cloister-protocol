// Copyright (c) 2026 DFX AG. Licensed under the MIT License (see LICENSE).

package zk

import (
	"testing"

	"github.com/consensys/gnark-crypto/ecc"
	"github.com/consensys/gnark-crypto/ecc/bn254/fr"
	"github.com/consensys/gnark/test"
)

// TestDepositAssignmentSolves: a deposit witness built from an empty-tree insertion
// context must satisfy the circuit (the native shielding path).
func TestDepositAssignmentSolves(t *testing.T) {
	tree := NewTree()
	root := tree.Root()
	pairEls, _ := tree.PairPath(0)

	var priv fr.Element
	priv.SetUint64(777)

	c := BuildDepositAssignment(DepositParams{
		Amount:      feUint(1000),
		OwnerPub:    PubKey(priv),
		Root:        root,
		PairIndex:   0,
		PairPathEls: pairEls,
		ExtDataHash: feUint(99),
	})
	if err := test.IsSolved(&TxCircuit{}, c, ecc.BN254.ScalarField()); err != nil {
		t.Fatalf("deposit witness not solved: %v", err)
	}
}
