// Copyright (c) 2026 DFX AG. Licensed under the MIT License (see LICENSE).

package zk

import (
	"testing"

	"github.com/consensys/gnark-crypto/ecc"
	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/frontend/cs/r1cs"
	"github.com/consensys/gnark/test"
)

func TestTxCircuitSolves(t *testing.T) {
	assignment := BuildAssignment(SampleInternalPaySpec())
	if err := test.IsSolved(&TxCircuit{}, assignment, ecc.BN254.ScalarField()); err != nil {
		t.Fatalf("circuit not solved by a valid internal payment: %v", err)
	}
}

func TestTxCircuitConstraints(t *testing.T) {
	cs, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, &TxCircuit{})
	if err != nil {
		t.Fatalf("compile: %v", err)
	}
	t.Logf("Cloister gnark Transaction circuit: %d constraints (Levels=%d, %d-in/%d-out)",
		cs.GetNbConstraints(), Levels, NIns, NOuts)
}
