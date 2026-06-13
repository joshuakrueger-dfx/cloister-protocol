// Copyright (c) 2026 DFX AG. All rights reserved. Proprietary and confidential.

package zk

import (
	"fmt"
	"math/big"

	"github.com/consensys/gnark-crypto/ecc/bn254/fr"
)

// SampleInternalPaySpec builds a canonical 1-real-input internal payment
// (1000 → 250 payment + 750 change, publicAmount 0) used by tooling and tests.
func SampleInternalPaySpec() *TxSpec {
	pool := NewTree()
	var privA fr.Element
	privA.SetUint64(111)
	pubA := PubKey(privA)

	inNote := Note{Amount: feUint(1000), PubKey: pubA, Blinding: feUint(555)}
	pool.Insert(inNote.Commitment()) // index 0
	pool.Insert(feUint(424242))      // filler leaf 1 → Len even (2)

	var privB fr.Element
	privB.SetUint64(222)
	out0 := Note{Amount: feUint(250), PubKey: PubKey(privB), Blinding: feUint(1001)}
	out1 := Note{Amount: feUint(750), PubKey: pubA, Blinding: feUint(1002)}

	return &TxSpec{
		Pool:         pool,
		Assoc:        pool,
		Inputs:       []SpendInput{{Note: inNote, Priv: privA, LeafIndex: 0}},
		Outputs:      [NOuts]Note{out0, out1},
		PublicAmount: feUint(0),
		ExtDataHash:  feUint(99),
	}
}

// varHex renders a frontend.Variable holding a *big.Int as a 0x-prefixed hex string.
func varHex(x interface{}) string {
	b, ok := x.(*big.Int)
	if !ok {
		panic(fmt.Sprintf("public signal is not *big.Int: %T", x))
	}
	return "0x" + b.Text(16)
}

// PublicSignals returns the 10 public signals of an assignment in on-chain order,
// matching the ShieldedPool's pub[10] array and the circuit's public-field order.
func PublicSignals(c *TxCircuit) [10]string {
	return [10]string{
		varHex(c.Root),
		varHex(c.PublicAmount),
		varHex(c.ExtDataHash),
		varHex(c.InputNullifier[0]),
		varHex(c.InputNullifier[1]),
		varHex(c.OutputCommitment[0]),
		varHex(c.OutputCommitment[1]),
		varHex(c.NewRoot),
		varHex(c.PairIndex),
		varHex(c.AssociationRoot),
	}
}
