// Copyright (c) 2026 DFX AG. Licensed under the MIT License (see LICENSE).

// Package ceremony drives a multi-party Groth16 Phase-2 trusted-setup ceremony for the Cloister
// circuit, on top of gnark's mpcsetup. The single-party cmd/setup is fine for testnet, but a
// value-bearing deployment MUST replace it with a ceremony where the proving keys are secure as
// long as AT LEAST ONE contributor was honest (discarded their toxic waste). This package is the
// reusable logic; cmd/ceremony is the operator CLI; a transcript of contribution files lets anyone
// re-verify the chain independently.
//
// Flow:
//   Phase 1 (universal "powers of tau"): InitPhase1 → each contributor Contribute1 → VerifyPhase1
//   Phase 2 (circuit-specific):          InitPhase2 → each contributor Contribute2 → FinalizePhase2
// Each contributor only ever sees the running transcript, never anyone else's secret randomness.
package ceremony

import (
	"fmt"
	"io"
	"os"

	"github.com/consensys/gnark-crypto/ecc"
	"github.com/consensys/gnark/backend/groth16"
	"github.com/consensys/gnark/backend/groth16/bn254/mpcsetup"
	csbn254 "github.com/consensys/gnark/constraint/bn254"
	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/frontend/cs/r1cs"

	"github.com/DFXswiss/cloister-protocol/prover-gnark/zk"
)

// CompileCircuit compiles the Cloister transaction circuit to a BN254 R1CS (the ceremony +
// Phase-2 are bound to THIS circuit; recompiling a changed circuit invalidates the ceremony).
func CompileCircuit() (*csbn254.R1CS, error) {
	ccs, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, &zk.TxCircuit{})
	if err != nil {
		return nil, fmt.Errorf("compile: %w", err)
	}
	r, ok := ccs.(*csbn254.R1CS)
	if !ok {
		return nil, fmt.Errorf("unexpected constraint system type %T", ccs)
	}
	return r, nil
}

// DomainSize is the powers-of-tau size the circuit needs (next power of two ≥ #constraints).
func DomainSize(r *csbn254.R1CS) uint64 {
	return ecc.NextPowerOfTwo(uint64(r.GetNbConstraints()))
}

// --- Phase 1 (universal) ---

// InitPhase1 produces the deterministic, uncontributed Phase-1 base for a given domain size.
func InitPhase1(domainSize uint64) *mpcsetup.Phase1 {
	var p mpcsetup.Phase1
	p.Initialize(domainSize)
	return &p
}

// Contribute1 adds this contributor's secret randomness to a Phase-1 transcript (in place).
// The contributor MUST run this on a clean, offline machine and discard the process memory after.
func Contribute1(p *mpcsetup.Phase1) { p.Contribute() }

// VerifyPhase1 verifies the full chain of Phase-1 contributions and seals it (with a public
// beacon) into the circuit-independent SRS commons. Fails if any contribution is invalid.
func VerifyPhase1(domainSize uint64, beacon []byte, contribs ...*mpcsetup.Phase1) (mpcsetup.SrsCommons, error) {
	return mpcsetup.VerifyPhase1(domainSize, beacon, contribs...)
}

// --- Phase 2 (circuit-specific) ---

// InitPhase2 produces the Phase-2 base + evaluations for this circuit from the sealed commons.
func InitPhase2(r *csbn254.R1CS, commons *mpcsetup.SrsCommons) (*mpcsetup.Phase2, *mpcsetup.Phase2Evaluations) {
	var p mpcsetup.Phase2
	evals := p.Initialize(r, commons)
	return &p, &evals
}

// Contribute2 adds this contributor's secret randomness to a Phase-2 transcript (in place).
func Contribute2(p *mpcsetup.Phase2) { p.Contribute() }

// FinalizePhase2 verifies the full chain of Phase-2 contributions, seals with a public beacon,
// and returns the final proving + verifying keys. These are the keys the prover + on-chain
// verifier use; they are secure if ≥1 Phase-1 AND ≥1 Phase-2 contributor was honest.
func FinalizePhase2(r *csbn254.R1CS, commons *mpcsetup.SrsCommons, beacon []byte, contribs ...*mpcsetup.Phase2) (groth16.ProvingKey, groth16.VerifyingKey, error) {
	return mpcsetup.VerifyPhase2(r, commons, beacon, contribs...)
}

// --- transcript file I/O ---

// WriteObj serializes any mpcsetup transcript object (Phase1/Phase2/SrsCommons) to a file.
func WriteObj(path string, obj io.WriterTo) error {
	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = obj.WriteTo(f)
	return err
}

// ReadObj deserializes a transcript object from a file.
func ReadObj(path string, obj io.ReaderFrom) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = obj.ReadFrom(f)
	return err
}
