// Copyright (c) 2026 DFX AG. Licensed under the MIT License (see LICENSE).

package zk

import (
	"bytes"
	"math/big"
	"testing"

	"github.com/consensys/gnark-crypto/ecc"
	"github.com/consensys/gnark/backend/groth16"
	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/frontend/cs/r1cs"
)

// TestGroth16RejectsTamperedProofAndInput is the negative counterpart to the happy-path
// roundtrip in groth16_test.go. test.IsSolved checks the R1CS; this checks the FULL Groth16
// pipeline: a real proof must verify, but it must FAIL to verify against a tampered public
// input, and a corrupted proof must not verify. Without this, a bug in the proving/serialization
// path (outside the constraints) would slip past the IsSolved-based soundness tests.
func TestGroth16RejectsTamperedProofAndInput(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping groth16 setup in -short")
	}
	ccs, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, &TxCircuit{})
	if err != nil {
		t.Fatalf("compile: %v", err)
	}
	pk, vk, err := groth16.Setup(ccs)
	if err != nil {
		t.Fatalf("setup: %v", err)
	}

	assignment := BuildAssignment(SampleInternalPaySpec())
	w, err := frontend.NewWitness(assignment, ecc.BN254.ScalarField())
	if err != nil {
		t.Fatalf("witness: %v", err)
	}
	pubW, _ := w.Public()

	proof, err := groth16.Prove(ccs, pk, w)
	if err != nil {
		t.Fatalf("prove: %v", err)
	}

	// 1) the honest proof verifies against the honest public input
	if err := groth16.Verify(proof, vk, pubW); err != nil {
		t.Fatalf("valid proof failed to verify: %v", err)
	}

	// 2) the SAME proof must NOT verify against a TAMPERED public input. We rebuild the public
	//    witness with one public signal altered (PublicAmount) — a verifier given the wrong
	//    public amount must reject, or value could be claimed that the proof never attested.
	tampered := *BuildAssignment(SampleInternalPaySpec())
	tampered.PublicAmount = new(big.Int).Add(big.NewInt(0), big.NewInt(1)) // honest pay has publicAmount 0
	tw, err := frontend.NewWitness(&tampered, ecc.BN254.ScalarField())
	if err != nil {
		t.Fatalf("tampered witness: %v", err)
	}
	tPubW, _ := tw.Public()
	if err := groth16.Verify(proof, vk, tPubW); err == nil {
		t.Fatal("SOUNDNESS VIOLATION: proof verified against a tampered public input")
	}

	// 3) a corrupted proof must not verify. Serialize, flip a byte, deserialize; either the
	//    deserialization rejects it (tamper-evident encoding) or Verify must fail.
	var buf bytes.Buffer
	if _, err := proof.WriteTo(&buf); err != nil {
		t.Fatalf("serialize proof: %v", err)
	}
	raw := buf.Bytes()
	raw[len(raw)/2] ^= 0xFF // corrupt a middle byte
	corrupt := groth16.NewProof(ecc.BN254)
	if _, err := corrupt.ReadFrom(bytes.NewReader(raw)); err != nil {
		return // deserialization rejected the corrupted proof — tamper detected, OK
	}
	if err := groth16.Verify(corrupt, vk, pubW); err == nil {
		t.Fatal("SOUNDNESS VIOLATION: a corrupted proof verified")
	}
}
