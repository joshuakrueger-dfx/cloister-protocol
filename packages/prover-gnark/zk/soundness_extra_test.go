// Copyright (c) 2026 DFX AG. Licensed under the MIT License (see LICENSE).

package zk

import (
	"testing"

	"github.com/consensys/gnark-crypto/ecc"
	"github.com/consensys/gnark/test"
)

// WP-A4 — targeted soundness tests closing the review's blind spots on the highest-value
// properties: (1) membership is enforced for every REAL (nonzero) input on BOTH the pool and
// the ASP association trees, at deeper levels and for input slot 1 (the under-constrained hunt
// only bumped level 0 of slot 0/1); (2) the isReal gate is a genuine positive/negative pair —
// a true zero-value dummy correctly skips membership, while a nonzero input cannot; (3) explicit
// 1-arity and 3-arity Poseidon2 known-answer vectors (only 2-arity was pinned before).

// oneRealInputValid builds a valid tx with ONE real input; input slot 1 is a genuine zero-value
// dummy (isReal[1] == 0), so its membership climbs are skipped.
func oneRealInputValid() *TxCircuit {
	pool := NewTree()
	p := feUint(111)
	n := Note{Amount: feUint(1000), PubKey: PubKey(p), Blinding: feUint(7)}
	i := pool.Insert(n.Commitment())
	pool.Insert(feUint(42)) // even Len for the pair-index insertion proof
	return BuildAssignment(&TxSpec{
		Pool: pool, Assoc: pool,
		Inputs:       []SpendInput{{Note: n, Priv: p, LeafIndex: i}},
		Outputs:      [NOuts]Note{{Amount: feUint(1000), PubKey: feUint(5), Blinding: feUint(8)}, {Amount: feUint(0), PubKey: feUint(6), Blinding: feUint(9)}},
		PublicAmount: feUint(0),
		ExtDataHash:  feUint(1),
	})
}

func solvesIS(t *testing.T, c *TxCircuit) bool {
	t.Helper()
	return test.IsSolved(&TxCircuit{}, c, ecc.BN254.ScalarField()) == nil
}

// A real (nonzero) input whose pool/association Merkle path does NOT climb to the bound root
// must be rejected — this is the anti-theft / anti-compliance-bypass core. We corrupt paths at
// deeper levels and on input slot 1 (both omitted by the level-0 under-constrained hunt).
func TestMembershipEnforcedForRealInputs(t *testing.T) {
	// sanity: the two-real-input base is valid
	if !solvesIS(t, twoRealInputValid()) {
		t.Fatal("base 2-real-input witness did not solve")
	}
	cases := []struct {
		name  string
		apply func(c *TxCircuit)
	}{
		{"pool path slot0 deep level", func(c *TxCircuit) { bump(&c.InPathEls[0][5]) }},
		{"pool path slot1 deep level", func(c *TxCircuit) { bump(&c.InPathEls[1][7]) }},
		{"assoc path slot0 deep level", func(c *TxCircuit) { bump(&c.InAssocEls[0][3]) }},
		{"assoc path slot1 level0 (hunt gap)", func(c *TxCircuit) { bump(&c.InAssocEls[1][0]) }},
		{"assoc path slot1 deep level", func(c *TxCircuit) { bump(&c.InAssocEls[1][9]) }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			c := twoRealInputValid()
			tc.apply(c)
			if solvesIS(t, c) {
				t.Fatalf("SOUNDNESS VIOLATION: a real input with a non-member path solved (%s)", tc.name)
			}
		})
	}
}

// The isReal gate (circuit.go: isReal = 1 - IsZero(amount)) must be a true two-way property:
//   - a genuine zero-value dummy skips BOTH membership climbs (so a corrupted dummy path is fine);
//   - a nonzero input can NOT skip membership (corrupting its path rejects).
// If membership were gated on anything other than the amount, one of these halves would flip.
func TestIsRealDummyGate(t *testing.T) {
	// base with a real slot0 and a zero-value dummy in slot1
	if !solvesIS(t, oneRealInputValid()) {
		t.Fatal("base 1-real-input witness did not solve")
	}

	t.Run("zero-value dummy skips membership (corrupted dummy paths still solve)", func(t *testing.T) {
		c := oneRealInputValid()
		bump(&c.InPathEls[1][0])  // dummy pool path → non-member
		bump(&c.InAssocEls[1][0]) // dummy assoc path → non-member
		bump(&c.InPathEls[1][11])
		if !solvesIS(t, c) {
			t.Fatal("isReal gate broken: a zero-value dummy did NOT skip membership (over-constrained)")
		}
	})

	t.Run("nonzero real input cannot skip membership", func(t *testing.T) {
		// slot0 is real & nonzero; corrupting its pool path must reject (membership enforced).
		c := oneRealInputValid()
		bump(&c.InPathEls[0][0])
		if solvesIS(t, c) {
			t.Fatal("SOUNDNESS VIOLATION: a nonzero input skipped pool membership")
		}
	})

	t.Run("nonzero real input cannot skip association membership", func(t *testing.T) {
		c := oneRealInputValid()
		bump(&c.InAssocEls[0][0])
		if solvesIS(t, c) {
			t.Fatal("SOUNDNESS VIOLATION: a nonzero input skipped ASP good-set membership")
		}
	})
}

// Explicit known-answer vectors for the 1-arity H(priv) and 3-arity commit/sig/nullifier hashes.
// Only the 2-arity node hash was pinned (TestPoseidon2KnownAnswer); these guard the other two
// arities actually used by the circuit (note.go: PubKey=H(x), Commit/Nullifier=H(a,b,c)) against
// silent parameter/round/serialization drift. Values are pinned against this implementation.
func TestPoseidon2ArityKnownAnswers(t *testing.T) {
	cases := []struct {
		name string
		in   []string
		want string
	}{
		{"arity-1 H(1)", []string{"1"}, "12157562999385135173166708316607836110878334226144932937475223226141207470306"},
		{"arity-2 H(1,2)", []string{"1", "2"}, "4443443265955166080716935670700081889283598504231460571509928329665379862364"},
		{"arity-3 H(1,2,3)", []string{"1", "2", "3"}, "15420506892278731668823630372592719583204298986030877100115762694548203411900"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := HashDecimal(tc.in)
			if err != nil {
				t.Fatalf("hash: %v", err)
			}
			if got != tc.want {
				t.Fatalf("Poseidon2 %s drifted: got %s, want %s", tc.name, got, tc.want)
			}
		})
	}
}
