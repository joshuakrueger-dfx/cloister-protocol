// Copyright (c) 2026 DFX AG. Licensed under the MIT License (see LICENSE).

// Command setup runs the Groth16 trusted setup once, persists the proving and
// verifying keys, and exports the matching Solidity verifier. Re-running with
// existing keys is a no-op (keys are reused) so the prover, the on-chain verifier
// and every emitted proof stay mutually consistent.
//
// NOTE: gnark's groth16.Setup uses fresh internal randomness ("toxic waste"). For
// mainnet this MUST be replaced by a multi-party Phase-2 ceremony; for testnet the
// persisted keys below are the single source of truth.
package main

import (
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/consensys/gnark-crypto/ecc"
	"github.com/consensys/gnark/backend/groth16"
	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/frontend/cs/r1cs"

	"github.com/DFXswiss/cloister-protocol/prover-gnark/zk"
)

func main() {
	root := "."
	if len(os.Args) > 1 {
		root = os.Args[1]
	}
	keysDir := filepath.Join(root, "keys")
	buildDir := filepath.Join(root, "build")
	must(os.MkdirAll(keysDir, 0o755))
	must(os.MkdirAll(buildDir, 0o755))

	cs, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, &zk.TxCircuit{})
	must(err)

	pkPath := filepath.Join(keysDir, "pk.bin")
	vkPath := filepath.Join(keysDir, "vk.bin")

	var pk groth16.ProvingKey
	var vk groth16.VerifyingKey
	if exists(pkPath) && exists(vkPath) {
		fmt.Println("keys exist → reusing", pkPath)
		pk = groth16.NewProvingKey(ecc.BN254)
		vk = groth16.NewVerifyingKey(ecc.BN254)
		readFrom(pkPath, pk)
		readFrom(vkPath, vk)
	} else {
		fmt.Println("running groth16.Setup …")
		pk, vk, err = groth16.Setup(cs)
		must(err)
		writeTo(pkPath, pk)
		writeTo(vkPath, vk)
		fmt.Println("wrote", pkPath, "+", vkPath)
	}

	// also persist the compiled R1CS so the prover can load it without recompiling
	csPath := filepath.Join(keysDir, "circuit.r1cs")
	writeTo(csPath, cs)

	// export the Solidity verifier from THIS vk
	solPath := filepath.Join(buildDir, "Verifier.sol")
	f, err := os.Create(solPath)
	must(err)
	defer f.Close()
	must(vk.ExportSolidity(f))
	fmt.Println("exported", solPath)
}

func exists(p string) bool { _, err := os.Stat(p); return err == nil }

func writeTo(path string, obj io.WriterTo) {
	f, err := os.Create(path)
	must(err)
	defer f.Close()
	_, err = obj.WriteTo(f)
	must(err)
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
