// Copyright (c) 2026 DFX AG. Licensed under the MIT License (see LICENSE).

package mobile

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/DFXswiss/cloister-protocol/prover-gnark/zk"
)

func TestHashMatchesNative(t *testing.T) {
	got, err := Hash(`["1","2"]`)
	if err != nil {
		t.Fatal(err)
	}
	wantStr, _ := zk.HashDecimal([]string{"1", "2"})
	if got != wantStr {
		t.Fatalf("Hash([1,2]) = %s, want %s", got, wantStr)
	}
}

func TestProveViaMobileSurface(t *testing.T) {
	if err := Init("../keys"); err != nil {
		t.Skipf("keys not found (run `go run ./cmd/setup .`): %v", err)
	}
	if !Ready() {
		t.Fatal("Ready() false after Init")
	}

	wi := zk.ToWitnessInput(zk.BuildAssignment(zk.SampleInternalPaySpec()))
	raw, _ := json.Marshal(wi)

	resJSON, err := Prove(string(raw))
	if err != nil {
		t.Fatalf("Prove: %v", err)
	}
	var res proveResult
	if err := json.Unmarshal([]byte(resJSON), &res); err != nil {
		t.Fatal(err)
	}
	// 256-byte proof → 0x + 512 hex chars
	if len(res.ProofHex) != 2+512 {
		t.Fatalf("proofHex len = %d, want 514", len(res.ProofHex))
	}
	if !strings.HasPrefix(res.A[0], "0x") {
		t.Fatalf("a[0] not hex: %s", res.A[0])
	}
	t.Logf("mobile Prove OK: proof %d bytes, root=%s…", (len(res.ProofHex)-2)/2, res.Public[0][:10])
}
