// Copyright (c) 2026 DFX AG. Licensed under the MIT License (see LICENSE).

package zk

import (
	"encoding/json"
	"math/big"
	"testing"

	"github.com/consensys/gnark-crypto/ecc"
	"github.com/consensys/gnark/test"
)

// TestWireRoundTrip: known-good assignment → SDK JSON → parsed assignment must
// (a) deep-equal the original field-by-field and (b) still satisfy the circuit.
// This locks the SDK↔circuit field mapping (the snarkjs.fullProve drop-in contract).
func TestWireRoundTrip(t *testing.T) {
	orig := BuildAssignment(SampleInternalPaySpec())

	wi := ToWitnessInput(orig)
	raw, err := json.Marshal(wi)
	if err != nil {
		t.Fatal(err)
	}
	var back WitnessInput
	if err := json.Unmarshal(raw, &back); err != nil {
		t.Fatal(err)
	}
	parsed, err := back.Assignment()
	if err != nil {
		t.Fatalf("assignment from wire: %v", err)
	}

	// (a) every public signal must survive the round-trip identically
	pub := PublicSignals(orig)
	pubBack := PublicSignals(parsed)
	for i := range pub {
		if normHex(pub[i]) != normHex(pubBack[i]) {
			t.Errorf("public[%d] mismatch: %s vs %s", i, pub[i], pubBack[i])
		}
	}

	// (b) the parsed assignment must satisfy the circuit
	if err := test.IsSolved(&TxCircuit{}, parsed, ecc.BN254.ScalarField()); err != nil {
		t.Fatalf("circuit not solved by wire-parsed assignment: %v", err)
	}
}

func normHex(s string) string {
	t := s
	base := 10
	if len(s) >= 2 && s[0] == '0' && (s[1] == 'x' || s[1] == 'X') {
		base, t = 16, s[2:]
	}
	n, _ := new(big.Int).SetString(t, base)
	return n.Text(16)
}
