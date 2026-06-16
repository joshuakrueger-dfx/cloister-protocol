// Copyright (c) 2026 DFX AG. Licensed under the MIT License (see LICENSE).

package prover

import (
	"testing"

	"github.com/DFXswiss/cloister-protocol/prover-gnark/zk"
)

const keysDir = "../keys"

// loadOrSkip loads the committed keys if present, otherwise falls back to an ephemeral
// in-memory setup so the full prove→verify path is exercised in CI too (committed pk.bin/r1cs
// are gitignored). It no longer skips — a real proof is always produced.
func loadOrSkip(t testing.TB) *Prover {
	if p, err := Load(keysDir); err == nil {
		return p
	}
	p, err := NewEphemeral()
	if err != nil {
		t.Fatalf("ephemeral setup: %v", err)
	}
	return p
}

func TestProveEndToEnd(t *testing.T) {
	p := loadOrSkip(t)
	res, err := p.Prove(zk.SampleInternalPaySpec())
	if err != nil {
		t.Fatalf("prove: %v", err)
	}
	if len(res.ProofBytes) != 256 {
		t.Fatalf("proof bytes = %d, want 256", len(res.ProofBytes))
	}
	if res.Public[1] != "0x0" { // PublicAmount of an internal pay is 0
		t.Errorf("PublicAmount = %s, want 0x0", res.Public[1])
	}
	t.Logf("proof ok: a[0]=%s… public[0](root)=%s…", res.A[0][:10], res.Public[0][:10])
}

func BenchmarkProve(b *testing.B) {
	p := loadOrSkip(b)
	// warm
	if _, err := p.Prove(zk.SampleInternalPaySpec()); err != nil {
		b.Fatalf("warm prove: %v", err)
	}
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, err := p.Prove(zk.SampleInternalPaySpec()); err != nil {
			b.Fatalf("prove: %v", err)
		}
	}
}
