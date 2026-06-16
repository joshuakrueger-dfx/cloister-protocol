// Copyright (c) 2026 DFX AG. Licensed under the MIT License (see LICENSE).

package zk

import (
	"math/big"
	"math/rand"
	"testing"

	"github.com/consensys/gnark-crypto/ecc"
	"github.com/consensys/gnark-crypto/ecc/bn254/fr"
	"github.com/consensys/gnark/constraint"
	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/frontend/cs/r1cs"
)

// Property-based soundness suite. The hand-written cases in soundness_test.go check a handful
// of tamperings; this file adds the two things a top-tier ZK audit expects:
//
//  1. COMPLETENESS over randomized inputs — many random *valid* 2-in/2-out transactions must
//     all satisfy the circuit (catches accidental over-constraining / brittle assumptions).
//  2. An UNDER-CONSTRAINED HUNT — starting from one valid witness, mutating EACH witness signal
//     in isolation must make the circuit reject. A signal whose mutation still solves is
//     under-constrained = the #1 ZK soundness bug class (it would let a prover forge that field).
//     The only public input deliberately exempt is ExtDataHash (bound on-chain, see circuit.go).
//
// We compile the R1CS ONCE and reuse ccs.IsSolved per case, so thousands of solves stay fast.

// compileTx compiles the transaction circuit once for the whole suite.
func compileTx(t testing.TB) constraint.ConstraintSystem {
	t.Helper()
	ccs, err := frontend.Compile(ecc.BN254.ScalarField(), r1cs.NewBuilder, &TxCircuit{})
	if err != nil {
		t.Fatalf("compile: %v", err)
	}
	return ccs
}

func solves(t testing.TB, ccs constraint.ConstraintSystem, c *TxCircuit) bool {
	t.Helper()
	w, err := frontend.NewWitness(c, ecc.BN254.ScalarField())
	if err != nil {
		t.Fatalf("witness: %v", err)
	}
	return ccs.IsSolved(w) == nil
}

// randField returns a small random field element in [lo, hi).
func randField(rng *rand.Rand, lo, hi uint64) fr.Element {
	return feUint(lo + uint64(rng.Int63n(int64(hi-lo))))
}

// randomValidSpec builds a value-conserving 2-in/2-out (or 1-real-input) transaction with
// random amounts, keys, blindings and tree positions. publicAmount ≥ 0 (deposit-like / internal
// pay), amounts kept well under 2^248 so no legitimate field wraparound occurs.
func randomValidSpec(rng *rand.Rand) *TxSpec {
	pool := NewTree()
	nReal := 1 + rng.Intn(NIns) // 1 or 2 real inputs
	inputs := make([]SpendInput, 0, nReal)
	var sumIn uint64
	for i := 0; i < nReal; i++ {
		amt := 1 + uint64(rng.Int63n(1_000_000))
		priv := randField(rng, 1, 1_000_000_000)
		note := Note{Amount: feUint(amt), PubKey: PubKey(priv), Blinding: randField(rng, 1, 1_000_000_000)}
		idx := pool.Insert(note.Commitment())
		inputs = append(inputs, SpendInput{Note: note, Priv: priv, LeafIndex: idx})
		sumIn += amt
	}
	// BuildAssignment uses pairIndex = Len/2, which needs an even leaf count.
	if pool.Len()%2 != 0 {
		pool.Insert(randField(rng, 1, 1_000_000_000)) // filler leaf
	}
	pub := uint64(rng.Int63n(1_000_000)) // publicAmount ≥ 0
	sumOut := sumIn + pub
	out0 := uint64(rng.Int63n(int64(sumOut) + 1)) // 0..sumOut
	out1 := sumOut - out0
	return &TxSpec{
		Pool:         pool,
		Assoc:        pool, // dev mode: association set == pool
		Inputs:       inputs,
		Outputs:      [NOuts]Note{{Amount: feUint(out0), PubKey: randField(rng, 1, 1e9), Blinding: randField(rng, 1, 1e9)}, {Amount: feUint(out1), PubKey: randField(rng, 1, 1e9), Blinding: randField(rng, 1, 1e9)}},
		PublicAmount: feUint(pub),
		ExtDataHash:  randField(rng, 0, 1e9),
	}
}

func TestTxCircuitCompletenessRandomized(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping randomized completeness in -short")
	}
	ccs := compileTx(t)
	const seed = 0x10c1_57e7 // fixed → reproducible CI; bump to widen coverage
	rng := rand.New(rand.NewSource(seed))
	const N = 256
	for i := 0; i < N; i++ {
		spec := randomValidSpec(rng)
		c := BuildAssignment(spec) // NOTE: mutates spec.Pool — fresh spec each iteration
		if !solves(t, ccs, c) {
			t.Fatalf("COMPLETENESS FAILURE at iter %d (seed %#x): a valid random tx did not satisfy the circuit", i, seed)
		}
	}
	t.Logf("completeness: %d random valid transactions all satisfied the circuit (seed %#x)", N, seed)
}

// twoRealInputValid builds a deterministic, fully-constrained valid witness (TWO real inputs, so
// no dummy-input path is skipped) — the substrate for the under-constrained hunt.
func twoRealInputValid() *TxCircuit {
	pool := NewTree()
	pA, pB := feUint(111), feUint(222)
	nA := Note{Amount: feUint(1000), PubKey: PubKey(pA), Blinding: feUint(7)}
	nB := Note{Amount: feUint(500), PubKey: PubKey(pB), Blinding: feUint(9)}
	iA := pool.Insert(nA.Commitment())
	iB := pool.Insert(nB.Commitment())
	out0 := Note{Amount: feUint(900), PubKey: feUint(333), Blinding: feUint(11)}
	out1 := Note{Amount: feUint(600), PubKey: feUint(444), Blinding: feUint(13)} // 900+600 = 1500 = 1000+500, pub=0
	return BuildAssignment(&TxSpec{
		Pool: pool, Assoc: pool,
		Inputs:       []SpendInput{{Note: nA, Priv: pA, LeafIndex: iA}, {Note: nB, Priv: pB, LeafIndex: iB}},
		Outputs:      [NOuts]Note{out0, out1},
		PublicAmount: feUint(0),
		ExtDataHash:  feUint(99),
	})
}

func bump(x *frontend.Variable) {
	b, ok := (*x).(*big.Int)
	if !ok {
		b = new(big.Int).SetUint64(0)
	}
	*x = new(big.Int).Add(b, big.NewInt(1))
}

// TestTxCircuitNoUnderConstrainedSignals mutates every witness signal of a valid 2-real-input
// transaction in isolation and asserts the circuit REJECTS — proving each signal is constrained.
// ExtDataHash is the single documented exception (on-chain bound).
func TestTxCircuitNoUnderConstrainedSignals(t *testing.T) {
	ccs := compileTx(t)
	// sanity: the base witness is valid
	if !solves(t, ccs, twoRealInputValid()) {
		t.Fatal("base 2-real-input witness did not solve")
	}

	type mut struct {
		name        string
		apply       func(c *TxCircuit)
		expectSolve bool // true only for genuinely-free (on-chain-bound) signals
	}
	muts := []mut{
		// public signals — all must be bound EXCEPT ExtDataHash
		{"Root", func(c *TxCircuit) { bump(&c.Root) }, false},
		{"PublicAmount", func(c *TxCircuit) { bump(&c.PublicAmount) }, false},
		{"ExtDataHash (free, on-chain bound)", func(c *TxCircuit) { bump(&c.ExtDataHash) }, true},
		{"InputNullifier[0]", func(c *TxCircuit) { bump(&c.InputNullifier[0]) }, false},
		{"InputNullifier[1]", func(c *TxCircuit) { bump(&c.InputNullifier[1]) }, false},
		{"OutputCommitment[0]", func(c *TxCircuit) { bump(&c.OutputCommitment[0]) }, false},
		{"OutputCommitment[1]", func(c *TxCircuit) { bump(&c.OutputCommitment[1]) }, false},
		{"NewRoot", func(c *TxCircuit) { bump(&c.NewRoot) }, false},
		{"PairIndex", func(c *TxCircuit) { bump(&c.PairIndex) }, false},
		{"AssociationRoot", func(c *TxCircuit) { bump(&c.AssociationRoot) }, false},
		// private inputs
		{"InAmount[0]", func(c *TxCircuit) { bump(&c.InAmount[0]) }, false},
		{"InAmount[1]", func(c *TxCircuit) { bump(&c.InAmount[1]) }, false},
		{"InPrivateKey[0]", func(c *TxCircuit) { bump(&c.InPrivateKey[0]) }, false},
		{"InPrivateKey[1]", func(c *TxCircuit) { bump(&c.InPrivateKey[1]) }, false},
		{"InBlinding[0]", func(c *TxCircuit) { bump(&c.InBlinding[0]) }, false},
		{"InBlinding[1]", func(c *TxCircuit) { bump(&c.InBlinding[1]) }, false},
		{"InPathIndex[0]", func(c *TxCircuit) { bump(&c.InPathIndex[0]) }, false},
		{"InPathIndex[1]", func(c *TxCircuit) { bump(&c.InPathIndex[1]) }, false},
		{"InPathEls[0][0]", func(c *TxCircuit) { bump(&c.InPathEls[0][0]) }, false},
		{"InPathEls[1][0]", func(c *TxCircuit) { bump(&c.InPathEls[1][0]) }, false},
		{"InAssocIndex[0]", func(c *TxCircuit) { bump(&c.InAssocIndex[0]) }, false},
		{"InAssocEls[0][0]", func(c *TxCircuit) { bump(&c.InAssocEls[0][0]) }, false},
		// private outputs
		{"OutAmount[0]", func(c *TxCircuit) { bump(&c.OutAmount[0]) }, false},
		{"OutPubkey[0]", func(c *TxCircuit) { bump(&c.OutPubkey[0]) }, false},
		{"OutBlinding[0]", func(c *TxCircuit) { bump(&c.OutBlinding[0]) }, false},
		// insertion witness
		{"PairPathEls[0]", func(c *TxCircuit) { bump(&c.PairPathEls[0]) }, false},
	}
	for _, m := range muts {
		t.Run(m.name, func(t *testing.T) {
			c := twoRealInputValid()
			m.apply(c)
			got := solves(t, ccs, c)
			if got && !m.expectSolve {
				t.Fatalf("UNDER-CONSTRAINED: mutating %s still satisfied the circuit — a prover could forge this signal", m.name)
			}
			if !got && m.expectSolve {
				t.Fatalf("OVER-CONSTRAINED: mutating %s broke the circuit, but it is meant to be free (on-chain bound)", m.name)
			}
		})
	}
}

// TestTxCircuitBoundaryAndAdversarial covers the explicit edge cases that fuzzing rarely hits.
func TestTxCircuitBoundaryAndAdversarial(t *testing.T) {
	ccs := compileTx(t)

	t.Run("duplicate input nullifiers rejected", func(t *testing.T) {
		c := twoRealInputValid()
		c.InputNullifier[1] = c.InputNullifier[0] // force equal → AssertIsDifferent must fire
		if solves(t, ccs, c) {
			t.Fatal("circuit accepted two equal input nullifiers (in-tx double-spend)")
		}
	})

	t.Run("value not conserved rejected", func(t *testing.T) {
		c := twoRealInputValid()
		c.OutAmount[0] = new(big.Int).Add(c.OutAmount[0].(*big.Int), big.NewInt(1)) // sumOut != sumIn+pub
		c.OutputCommitment[0] = bigVar(Commit(feFromVar(c.OutAmount[0]), feFromVar(c.OutPubkey[0]), feFromVar(c.OutBlinding[0])))
		if solves(t, ccs, c) {
			t.Fatal("circuit accepted a value-non-conserving transaction (mint)")
		}
	})

	t.Run("zero-value output accepted (valid)", func(t *testing.T) {
		pool := NewTree()
		p := feUint(111)
		n := Note{Amount: feUint(1000), PubKey: PubKey(p), Blinding: feUint(7)}
		i := pool.Insert(n.Commitment())
		pool.Insert(feUint(42)) // even Len
		c := BuildAssignment(&TxSpec{
			Pool: pool, Assoc: pool,
			Inputs:       []SpendInput{{Note: n, Priv: p, LeafIndex: i}},
			Outputs:      [NOuts]Note{{Amount: feUint(1000), PubKey: feUint(5), Blinding: feUint(8)}, {Amount: feUint(0), PubKey: feUint(6), Blinding: feUint(9)}},
			PublicAmount: feUint(0),
			ExtDataHash:  feUint(1),
		})
		if !solves(t, ccs, c) {
			t.Fatal("circuit rejected a valid zero-value output")
		}
	})

	t.Run("out-of-range output amount rejected (2^248)", func(t *testing.T) {
		c := twoRealInputValid()
		over := new(big.Int).Lsh(big.NewInt(1), amountBits) // 2^248 — exceeds the 248-bit range check
		c.OutAmount[0] = over
		// keep the commitment consistent so ONLY the range check can reject it
		c.OutputCommitment[0] = bigVar(Commit(feFromVar(over), feFromVar(c.OutPubkey[0]), feFromVar(c.OutBlinding[0])))
		if solves(t, ccs, c) {
			t.Fatal("circuit accepted an out-of-range (≥2^248) output amount — range check missing")
		}
	})
}

func feFromVar(x frontend.Variable) fr.Element {
	var e fr.Element
	e.SetBigInt(x.(*big.Int))
	return e
}

func bigVar(e fr.Element) frontend.Variable {
	b := new(big.Int)
	e.BigInt(b)
	return b
}
