// Copyright (c) 2026 DFX AG. Licensed under the MIT License (see LICENSE).

//go:build !race

// Excluded from the -race build: the ceremony does heavy MSMs over a 2^16 domain (~3min),
// which under the race detector would blow the main job's timeout. It runs in its own
// non-race CI job instead (see .github/workflows/ci.yml: ceremony).

package ceremony

import (
	"bytes"
	"path/filepath"
	"testing"

	"github.com/consensys/gnark-crypto/ecc"
	"github.com/consensys/gnark/backend/groth16"
	"github.com/consensys/gnark/backend/groth16/bn254/mpcsetup"
	"github.com/consensys/gnark/frontend"

	"github.com/DFXswiss/cloister-protocol/prover-gnark/zk"
)

// TestCeremonyRoundtrip runs a full multi-party Phase-1 + Phase-2 ceremony through the transcript
// file I/O (exactly what cmd/ceremony does across machines) and proves the extracted keys actually
// work: a real proof for the Cloister circuit verifies under the ceremony's vk, and the Solidity
// verifier exports. This is the end-to-end guarantee that the ceremony tooling produces usable,
// matching pk/vk — the whole point of replacing the single-party setup.
func TestCeremonyRoundtrip(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping multi-party ceremony (MSMs over 2^16) in -short")
	}
	const nP1, nP2 = 2, 2 // independent contributors per phase (≥1 honest ⇒ secure)
	dir := t.TempDir()

	r, err := CompileCircuit()
	if err != nil {
		t.Fatalf("compile: %v", err)
	}
	domain := DomainSize(r)
	t.Logf("circuit: %d constraints → domain 2^%d", r.GetNbConstraints(), bitsOf(domain))

	// --- Phase 1: base → contributors (each reads prev file, contributes, writes next) ---
	base1 := filepath.Join(dir, "p1-0.bin")
	if err := WriteObj(base1, InitPhase1(domain)); err != nil {
		t.Fatalf("phase1 init: %v", err)
	}
	p1Files := make([]string, nP1)
	prev := base1
	for i := 0; i < nP1; i++ {
		p := new(mpcsetup.Phase1)
		if err := ReadObj(prev, p); err != nil {
			t.Fatalf("read phase1 %d: %v", i, err)
		}
		Contribute1(p)
		out := filepath.Join(dir, "p1-"+itoa(i+1)+".bin")
		if err := WriteObj(out, p); err != nil {
			t.Fatalf("write phase1 %d: %v", i, err)
		}
		p1Files[i] = out
		prev = out
	}

	// coordinator verifies the whole chain + seals with a public beacon
	p1Contribs := make([]*mpcsetup.Phase1, nP1)
	for i, f := range p1Files {
		p1Contribs[i] = new(mpcsetup.Phase1)
		if err := ReadObj(f, p1Contribs[i]); err != nil {
			t.Fatalf("reload phase1 %d: %v", i, err)
		}
	}
	commons, err := VerifyPhase1(domain, []byte("cloister-ceremony-test/phase1-beacon"), p1Contribs...)
	if err != nil {
		t.Fatalf("VerifyPhase1: %v", err)
	}

	// --- Phase 2: circuit-specific base → contributors ---
	base2, _ := InitPhase2(r, &commons)
	p2base := filepath.Join(dir, "p2-0.bin")
	if err := WriteObj(p2base, base2); err != nil {
		t.Fatalf("phase2 init: %v", err)
	}
	p2Files := make([]string, nP2)
	prev = p2base
	for i := 0; i < nP2; i++ {
		p := new(mpcsetup.Phase2)
		if err := ReadObj(prev, p); err != nil {
			t.Fatalf("read phase2 %d: %v", i, err)
		}
		Contribute2(p)
		out := filepath.Join(dir, "p2-"+itoa(i+1)+".bin")
		if err := WriteObj(out, p); err != nil {
			t.Fatalf("write phase2 %d: %v", i, err)
		}
		p2Files[i] = out
		prev = out
	}
	p2Contribs := make([]*mpcsetup.Phase2, nP2)
	for i, f := range p2Files {
		p2Contribs[i] = new(mpcsetup.Phase2)
		if err := ReadObj(f, p2Contribs[i]); err != nil {
			t.Fatalf("reload phase2 %d: %v", i, err)
		}
	}
	pk, vk, err := FinalizePhase2(r, &commons, []byte("cloister-ceremony-test/phase2-beacon"), p2Contribs...)
	if err != nil {
		t.Fatalf("FinalizePhase2: %v", err)
	}

	// --- the extracted keys must actually prove + verify the Cloister circuit ---
	assignment := zk.BuildAssignment(zk.SampleInternalPaySpec())
	w, err := frontend.NewWitness(assignment, ecc.BN254.ScalarField())
	if err != nil {
		t.Fatalf("witness: %v", err)
	}
	proof, err := groth16.Prove(r, pk, w)
	if err != nil {
		t.Fatalf("prove with ceremony pk: %v", err)
	}
	pubW, _ := w.Public()
	if err := groth16.Verify(proof, vk, pubW); err != nil {
		t.Fatalf("verify with ceremony vk: %v", err)
	}

	// a tampered public input must NOT verify under the ceremony vk (sanity that the keys bind)
	tampered := *zk.BuildAssignment(zk.SampleInternalPaySpec())
	tampered.PublicAmount = 1
	tw, _ := frontend.NewWitness(&tampered, ecc.BN254.ScalarField())
	tPub, _ := tw.Public()
	if groth16.Verify(proof, vk, tPub) == nil {
		t.Fatal("ceremony vk verified a tampered public input")
	}

	// the Solidity verifier must export from the ceremony vk
	var sol bytes.Buffer
	if err := vk.ExportSolidity(&sol); err != nil {
		t.Fatalf("export solidity: %v", err)
	}
	if sol.Len() == 0 {
		t.Fatal("empty Solidity verifier export")
	}
	t.Logf("ceremony OK: %d+%d contributions, keys prove+verify, verifier exported (%d bytes)", nP1, nP2, sol.Len())
}

func itoa(i int) string { return string(rune('0' + i)) }
func bitsOf(n uint64) int {
	b := 0
	for n > 1 {
		n >>= 1
		b++
	}
	return b
}
