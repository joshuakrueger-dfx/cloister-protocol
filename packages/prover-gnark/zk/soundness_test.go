// Copyright (c) 2026 DFX AG. Licensed under the MIT License (see LICENSE).

package zk

import (
	"testing"

	"github.com/consensys/gnark-crypto/ecc"
	"github.com/consensys/gnark-crypto/ecc/bn254/fr"
	"github.com/consensys/gnark/test"
)

// Soundness negative tests: a witness with ANY tampered public output must NOT satisfy the
// circuit. These guard the binding of nullifiers / output commitments / roots / value to the
// private witness — the property that makes a shielded payment unforgeable. (A passing
// `IsSolved` on a tampered witness would be a soundness break = mint/steal of funds.)
func TestTxCircuitRejectsTamperedWitness(t *testing.T) {
	cases := []struct {
		name string
		mut  func(c *TxCircuit)
	}{
		{"forged input nullifier", func(c *TxCircuit) { c.InputNullifier[0] = 1 }},
		{"forged output commitment", func(c *TxCircuit) { c.OutputCommitment[0] = 1 }},
		{"wrong new root", func(c *TxCircuit) { c.NewRoot = 1 }},
		{"wrong old root", func(c *TxCircuit) { c.Root = 1 }},
		{"value not conserved (inflated publicAmount)", func(c *TxCircuit) { c.PublicAmount = 1 }},
		{"forged association root", func(c *TxCircuit) { c.AssociationRoot = 1 }},
		// NOTE: ExtDataHash is intentionally NOT constrained inside the circuit — it is a
		// pass-through public input whose integrity is enforced ON-CHAIN (the contract
		// recomputes keccak(extData) % FIELD and rejects a mismatch). That binding is
		// covered by the Solidity contract test suite, not here.
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			c := *BuildAssignment(SampleInternalPaySpec()) // value copy — arrays copy by value
			tc.mut(&c)
			if err := test.IsSolved(&TxCircuit{}, &c, ecc.BN254.ScalarField()); err == nil {
				t.Fatalf("SOUNDNESS VIOLATION: circuit accepted a tampered witness (%s)", tc.name)
			}
		})
	}
}

// The deposit assignment must likewise reject tampering (the shield entry point).
func TestDepositRejectsTamperedWitness(t *testing.T) {
	base := func() *TxCircuit {
		tree := NewTree()
		pairEls, _ := tree.PairPath(0)
		var priv fr.Element
		priv.SetUint64(777)
		return BuildDepositAssignment(DepositParams{
			Amount: feUint(1000), OwnerPub: PubKey(priv), Root: tree.Root(),
			PairIndex: 0, PairPathEls: pairEls, ExtDataHash: feUint(99),
		})
	}
	// sanity: the untampered deposit must solve
	if err := test.IsSolved(&TxCircuit{}, base(), ecc.BN254.ScalarField()); err != nil {
		t.Fatalf("valid deposit did not solve: %v", err)
	}
	for _, tc := range []struct {
		name string
		mut  func(c *TxCircuit)
	}{
		{"forged output commitment", func(c *TxCircuit) { c.OutputCommitment[0] = 1 }},
		{"wrong new root", func(c *TxCircuit) { c.NewRoot = 1 }},
		{"value not conserved", func(c *TxCircuit) { c.PublicAmount = 0 }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			c := *base()
			tc.mut(&c)
			if err := test.IsSolved(&TxCircuit{}, &c, ecc.BN254.ScalarField()); err == nil {
				t.Fatalf("SOUNDNESS VIOLATION: deposit accepted a tampered witness (%s)", tc.name)
			}
		})
	}
}

// Known-answer vector for Poseidon2 — a golden value that the Go prover, the Solidity
// verifier and the TS SDK must all reproduce. Guards against silent parameter/serialization
// drift across the language boundary (the SDK + relayer delegate hashing to this code).
func TestPoseidon2KnownAnswer(t *testing.T) {
	const want = "4443443265955166080716935670700081889283598504231460571509928329665379862364"
	got, err := HashDecimal([]string{"1", "2"})
	if err != nil {
		t.Fatalf("hash: %v", err)
	}
	if got != want {
		t.Fatalf("Poseidon2 H([1,2]) drifted: got %s, want %s", got, want)
	}
}
