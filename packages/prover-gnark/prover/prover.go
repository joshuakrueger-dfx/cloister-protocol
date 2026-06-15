// Copyright (c) 2026 DFX AG. Licensed under the MIT License (see LICENSE).

// Package prover is the reusable Cloister proving library: load the circuit + keys
// once, then produce a Groth16 proof for any shielded transaction. It is the single
// proving entry point shared by the native (gomobile) on-device prover, a prover
// service, and the tests/benchmarks.
package prover

import (
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/consensys/gnark-crypto/ecc"
	"github.com/consensys/gnark/backend/groth16"
	groth16bn254 "github.com/consensys/gnark/backend/groth16/bn254"
	"github.com/consensys/gnark/constraint"
	"github.com/consensys/gnark/frontend"

	"github.com/DFXswiss/cloister-protocol/prover-gnark/zk"
)

// Prover holds the compiled circuit and keys in memory for repeated proving.
type Prover struct {
	cs constraint.ConstraintSystem
	pk groth16.ProvingKey
	vk groth16.VerifyingKey
}

// Result is a proof ready for the on-chain verifier.
type Result struct {
	// ProofBytes is the 256-byte MarshalSolidity proof (what the bytes verifier takes).
	ProofBytes []byte
	// A/B/C are the same proof split into the (a,b,c) struct the ShieldedPool consumes.
	A     [2]string
	B     [2][2]string
	C     [2]string
	// Public are the 10 public signals in on-chain order.
	Public [10]string
}

// Load reads the persisted R1CS, proving key and verifying key from keysDir
// (produced by cmd/setup). This is the one-time cost; Prove is then hot.
func Load(keysDir string) (*Prover, error) {
	cs := groth16.NewCS(ecc.BN254)
	if err := readFrom(filepath.Join(keysDir, "circuit.r1cs"), cs); err != nil {
		return nil, fmt.Errorf("load r1cs: %w", err)
	}
	pk := groth16.NewProvingKey(ecc.BN254)
	if err := readFrom(filepath.Join(keysDir, "pk.bin"), pk); err != nil {
		return nil, fmt.Errorf("load pk: %w", err)
	}
	vk := groth16.NewVerifyingKey(ecc.BN254)
	if err := readFrom(filepath.Join(keysDir, "vk.bin"), vk); err != nil {
		return nil, fmt.Errorf("load vk: %w", err)
	}
	return &Prover{cs: cs, pk: pk, vk: vk}, nil
}

// LoadFrom reads the R1CS, proving key and verifying key from in-memory readers.
// Used by the WASM build, which receives the key bytes from JS (fetched over HTTP)
// rather than from a filesystem directory.
func LoadFrom(r1cs, pkR, vkR io.Reader) (*Prover, error) {
	cs := groth16.NewCS(ecc.BN254)
	if _, err := cs.ReadFrom(r1cs); err != nil {
		return nil, fmt.Errorf("load r1cs: %w", err)
	}
	pk := groth16.NewProvingKey(ecc.BN254)
	if _, err := pk.ReadFrom(pkR); err != nil {
		return nil, fmt.Errorf("load pk: %w", err)
	}
	vk := groth16.NewVerifyingKey(ecc.BN254)
	if _, err := vk.ReadFrom(vkR); err != nil {
		return nil, fmt.Errorf("load vk: %w", err)
	}
	return &Prover{cs: cs, pk: pk, vk: vk}, nil
}

// Prove generates a proof for the given transaction spec and self-verifies it.
func (p *Prover) Prove(spec *zk.TxSpec) (*Result, error) {
	return p.proveAssignment(zk.BuildAssignment(spec))
}

// ProveWitness generates a proof from the SDK wire witness (the snarkjs.fullProve
// drop-in path). The witness values were hashed with the same Poseidon2 the circuit
// enforces, so the assignment is internally consistent.
func (p *Prover) ProveWitness(wi *zk.WitnessInput) (*Result, error) {
	assignment, err := wi.Assignment()
	if err != nil {
		return nil, fmt.Errorf("wire assignment: %w", err)
	}
	return p.proveAssignment(assignment)
}

func (p *Prover) proveAssignment(assignment *zk.TxCircuit) (*Result, error) {
	w, err := frontend.NewWitness(assignment, ecc.BN254.ScalarField())
	if err != nil {
		return nil, fmt.Errorf("witness: %w", err)
	}
	proof, err := groth16.Prove(p.cs, p.pk, w)
	if err != nil {
		return nil, fmt.Errorf("prove: %w", err)
	}
	pw, err := w.Public()
	if err != nil {
		return nil, err
	}
	if err := groth16.Verify(proof, p.vk, pw); err != nil {
		return nil, fmt.Errorf("self-verify failed (key/circuit mismatch?): %w", err)
	}

	sol := proof.(*groth16bn254.Proof).MarshalSolidity()
	if len(sol) != 256 {
		return nil, fmt.Errorf("unexpected proof length %d (commitments unsupported)", len(sol))
	}
	w8 := func(i int) string { return "0x" + hex.EncodeToString(sol[i*32:(i+1)*32]) }
	return &Result{
		ProofBytes: sol,
		A:          [2]string{w8(0), w8(1)},
		B:          [2][2]string{{w8(2), w8(3)}, {w8(4), w8(5)}},
		C:          [2]string{w8(6), w8(7)},
		Public:     zk.PublicSignals(assignment),
	}, nil
}

func readFrom(path string, obj io.ReaderFrom) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = obj.ReadFrom(f)
	return err
}
