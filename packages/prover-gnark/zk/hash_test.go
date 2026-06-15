// Copyright (c) 2026 DFX AG. Licensed under the MIT License (see LICENSE).

package zk

import (
	"testing"

	"github.com/consensys/gnark-crypto/ecc"
	"github.com/consensys/gnark-crypto/ecc/bn254/fr"
	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/std/hash/poseidon2"
	"github.com/consensys/gnark/test"
)

// hashCircuit hashes two inputs in-circuit and asserts the result equals the
// publicly-supplied Out — which the test fills with the NATIVE H(a,b).
type hashCircuit struct {
	A   frontend.Variable
	B   frontend.Variable
	Out frontend.Variable `gnark:",public"`
}

func (c *hashCircuit) Define(api frontend.API) error {
	h, err := poseidon2.New(api)
	if err != nil {
		return err
	}
	h.Write(c.A, c.B)
	api.AssertIsEqual(h.Sum(), c.Out)
	return nil
}

// TestHashNativeMatchesCircuit is THE foundational gate: the native Poseidon2
// hash (used to build commitments/nullifiers/merkle off-circuit) must equal the
// in-circuit hash. If this fails, nothing else can be sound.
func TestHashNativeMatchesCircuit(t *testing.T) {
	var a, b fr.Element
	a.SetUint64(11111)
	b.SetUint64(22222)
	native := H(a, b)

	err := test.IsSolved(
		&hashCircuit{},
		&hashCircuit{A: a, B: b, Out: native},
		ecc.BN254.ScalarField(),
	)
	if err != nil {
		t.Fatalf("native Poseidon2 hash does NOT match in-circuit hash: %v", err)
	}
}
