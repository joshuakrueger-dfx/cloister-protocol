// Copyright (c) 2026 DFX AG. All rights reserved. Proprietary and confidential.

// Command emitproof generates a real Groth16 proof for a sample internal-payment
// transaction and writes it (decomposed into the on-chain (a,b,c) layout plus the
// 10 public signals) to a JSON file the Hardhat verifier test consumes.
package main

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/consensys/gnark-crypto/ecc"
	"github.com/consensys/gnark/backend/groth16"
	groth16bn254 "github.com/consensys/gnark/backend/groth16/bn254"
	"github.com/consensys/gnark/frontend"

	"github.com/DFXswiss/cloister-protocol/prover-gnark/zk"
)

type proofJSON struct {
	A        [2]string     `json:"a"`
	B        [2][2]string  `json:"b"`
	C        [2]string     `json:"c"`
	Input    [10]string    `json:"input"`
	ProofHex string        `json:"proofHex"`
}

func word(b []byte) string { return "0x" + hex.EncodeToString(b) }

func main() {
	if len(os.Args) < 3 {
		fmt.Fprintln(os.Stderr, "usage: emitproof <keysDir> <out.json>")
		os.Exit(1)
	}
	keysDir := os.Args[1]
	out := os.Args[2]

	// Load the persisted R1CS + proving/verifying key produced by cmd/setup, so the
	// emitted proof matches the deployed Solidity verifier exactly.
	cs := groth16.NewCS(ecc.BN254)
	readFrom(filepath.Join(keysDir, "circuit.r1cs"), cs)
	pk := groth16.NewProvingKey(ecc.BN254)
	readFrom(filepath.Join(keysDir, "pk.bin"), pk)
	vk := groth16.NewVerifyingKey(ecc.BN254)
	readFrom(filepath.Join(keysDir, "vk.bin"), vk)

	assignment := zk.BuildAssignment(zk.SampleInternalPaySpec())
	w, err := frontend.NewWitness(assignment, ecc.BN254.ScalarField())
	must(err)
	proof, err := groth16.Prove(cs, pk, w)
	must(err)
	pw, _ := w.Public()
	must(groth16.Verify(proof, vk, pw)) // sanity: native verify must pass

	sol := proof.(*groth16bn254.Proof).MarshalSolidity()
	if len(sol) != 256 {
		panic(fmt.Sprintf("expected 256-byte proof, got %d (commitments not supported here)", len(sol)))
	}
	var words [8]string
	for i := 0; i < 8; i++ {
		words[i] = word(sol[i*32 : (i+1)*32])
	}

	pj := proofJSON{
		A:        [2]string{words[0], words[1]},
		B:        [2][2]string{{words[2], words[3]}, {words[4], words[5]}},
		C:        [2]string{words[6], words[7]},
		ProofHex: "0x" + hex.EncodeToString(sol),
		Input:    zk.PublicSignals(assignment),
	}

	data, _ := json.MarshalIndent(pj, "", "  ")
	must(os.WriteFile(out, data, 0o644))
	fmt.Printf("wrote %s (proof %d bytes, %d public signals)\n", out, len(sol), len(pj.Input))
}

func readFrom(path string, obj io.ReaderFrom) {
	f, err := os.Open(path)
	must(err)
	defer f.Close()
	_, err = obj.ReadFrom(f)
	must(err)
}

func must(err error) {
	if err != nil {
		panic(err)
	}
}
