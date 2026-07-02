// Copyright (c) 2026 DFX AG. Licensed under the MIT License (see LICENSE).

package zk

import (
	"math/big"
	"testing"

	"github.com/consensys/gnark-crypto/ecc/bn254/fr"
)

// #8 — in-circuit PublicAmount magnitude bound (Track B / pre-ceremony re-key candidate).
// Proves the new constraint bounds |signed(PublicAmount)| < 2^248: a value-conserving deposit
// whose PublicAmount magnitude reaches 2^249-2 (each output is an in-range 2^248-1, so it is NOT
// caught by the per-output 248-bit range check) must now be REJECTED, while normal deposits and
// withdrawals still solve. Without #8 the oversized case would satisfy the circuit.
func TestPublicAmountMagnitudeBound(t *testing.T) {
	big248 := new(big.Int).Lsh(big.NewInt(1), 248)
	maxOut := new(big.Int).Sub(big248, big.NewInt(1)) // 2^248 - 1 (max in-range amount)
	var outAmt fr.Element
	outAmt.SetBigInt(maxOut)
	var pubOversized fr.Element
	pubOversized.SetBigInt(new(big.Int).Mul(maxOut, big.NewInt(2))) // 2^249 - 2 ≥ 2^248

	t.Run("oversized publicAmount magnitude rejected", func(t *testing.T) {
		pool := NewTree()
		c := BuildAssignment(&TxSpec{
			Pool: pool, Assoc: pool,
			Inputs: nil, // deposit: dummy inputs, sumIn = 0
			Outputs: [NOuts]Note{
				{Amount: outAmt, PubKey: PubKey(feUint(7)), Blinding: feUint(11)},
				{Amount: outAmt, PubKey: PubKey(feUint(8)), Blinding: feUint(13)},
			},
			PublicAmount: pubOversized, // = sumOut, value-conserving, but |·| ≥ 2^248
			ExtDataHash:  feUint(99),
		})
		if solvesIS(t, c) {
			t.Fatal("SOUNDNESS: circuit accepted a PublicAmount whose magnitude ≥ 2^248")
		}
	})

	t.Run("normal deposit still solves (completeness)", func(t *testing.T) {
		pool := NewTree()
		c := BuildAssignment(&TxSpec{
			Pool: pool, Assoc: pool,
			Inputs: nil,
			Outputs: [NOuts]Note{
				{Amount: feUint(1000), PubKey: PubKey(feUint(7)), Blinding: feUint(11)},
				{Amount: feUint(0), PubKey: PubKey(feUint(8)), Blinding: feUint(13)},
			},
			PublicAmount: feUint(1000),
			ExtDataHash:  feUint(99),
		})
		if !solvesIS(t, c) {
			t.Fatal("COMPLETENESS: #8 bound rejected a normal deposit")
		}
	})

	t.Run("withdrawal (negative publicAmount) still solves", func(t *testing.T) {
		pool := NewTree()
		p := feUint(111)
		n := Note{Amount: feUint(1000), PubKey: PubKey(p), Blinding: feUint(7)}
		i := pool.Insert(n.Commitment())
		pool.Insert(feUint(42)) // even leaf count
		// spend 1000, keep 600 as change, withdraw 400 → publicAmount = -400 (field p-400)
		var pubNeg fr.Element
		pubNeg.SetBigInt(new(big.Int).Sub(fr.Modulus(), big.NewInt(400)))
		c := BuildAssignment(&TxSpec{
			Pool: pool, Assoc: pool,
			Inputs: []SpendInput{{Note: n, Priv: p, LeafIndex: i}},
			Outputs: [NOuts]Note{
				{Amount: feUint(600), PubKey: PubKey(feUint(8)), Blinding: feUint(13)},
				{Amount: feUint(0), PubKey: PubKey(feUint(9)), Blinding: feUint(17)},
			},
			PublicAmount: pubNeg,
			ExtDataHash:  feUint(99),
		})
		if !solvesIS(t, c) {
			t.Fatal("COMPLETENESS: #8 bound rejected a valid withdrawal")
		}
	})
}
