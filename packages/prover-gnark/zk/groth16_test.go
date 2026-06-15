// Copyright (c) 2026 DFX AG. Licensed under the MIT License (see LICENSE).

package zk

import (
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/consensys/gnark-crypto/ecc"
	"github.com/consensys/gnark/backend/groth16"
	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/frontend/cs/r1cs"
)

// TestGroth16RoundtripAndExport: real setup → prove → verify, exports the Solidity
// verifier, and benchmarks proof time (desktop proxy for the native-prover target).
func TestGroth16RoundtripAndExport(t *testing.T) {
	cs, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, &TxCircuit{})
	if err != nil {
		t.Fatalf("compile: %v", err)
	}

	t0 := time.Now()
	pk, vk, err := groth16.Setup(cs)
	if err != nil {
		t.Fatalf("setup: %v", err)
	}
	t.Logf("setup: %s", time.Since(t0))

	assignment := BuildAssignment(SampleInternalPaySpec())
	w, err := frontend.NewWitness(assignment, ecc.BN254.ScalarField())
	if err != nil {
		t.Fatalf("witness: %v", err)
	}
	pw, _ := w.Public()

	// warm + timed prove
	if _, err = groth16.Prove(cs, pk, w); err != nil {
		t.Fatalf("prove(warm): %v", err)
	}
	t1 := time.Now()
	proof, err := groth16.Prove(cs, pk, w)
	if err != nil {
		t.Fatalf("prove: %v", err)
	}
	dur := time.Since(t1)
	t.Logf("PROVE: %s  (was ~1.78s with snarkjs/WebView)", dur)

	if err = groth16.Verify(proof, vk, pw); err != nil {
		t.Fatalf("verify: %v", err)
	}
	t.Log("verify: OK")

	// export Apache-2/own Solidity verifier
	outDir := filepath.Join("..", "build")
	_ = os.MkdirAll(outDir, 0o755)
	f, err := os.Create(filepath.Join(outDir, "Verifier.sol"))
	if err != nil {
		t.Fatalf("create verifier: %v", err)
	}
	defer f.Close()
	if err = vk.ExportSolidity(f); err != nil {
		t.Fatalf("export solidity: %v", err)
	}
	t.Logf("exported Solidity verifier → packages/prover-gnark/build/Verifier.sol")
}
