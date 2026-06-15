// Copyright (c) 2026 DFX AG. Licensed under the MIT License (see LICENSE).

package zk

import (
	"math/big"

	"github.com/consensys/gnark-crypto/ecc/bn254/fr"
	"github.com/consensys/gnark/frontend"
)

// SpendInput is a real note being spent (PubKey(Priv) must equal Note.PubKey).
type SpendInput struct {
	Note      Note
	Priv      fr.Element
	LeafIndex int
}

// TxSpec describes a shielded transaction to be proven.
type TxSpec struct {
	Pool         *Tree // pool tree, with all real input notes already inserted
	Assoc        *Tree // association/good-set tree (dev mode: same as Pool)
	Inputs       []SpendInput
	Outputs      [NOuts]Note
	PublicAmount fr.Element // extAmount - fee, field-encoded
	ExtDataHash  fr.Element
}

func v(e fr.Element) frontend.Variable {
	b := new(big.Int)
	e.BigInt(b)
	return b
}

func feUint(x uint64) fr.Element { var e fr.Element; e.SetUint64(x); return e }

// BuildAssignment turns a TxSpec into a fully-populated circuit witness, computing
// every public + private signal with the native primitives. NewRoot is produced by
// inserting the two outputs into the pool (the tree advances by one pair).
func BuildAssignment(spec *TxSpec) *TxCircuit {
	var c TxCircuit
	zeros := Zeros()

	root := spec.Pool.Root()
	aroot := spec.Assoc.Root()
	c.Root = v(root)
	c.AssociationRoot = v(aroot)
	c.PublicAmount = v(spec.PublicAmount)
	c.ExtDataHash = v(spec.ExtDataHash)

	for t := 0; t < NIns; t++ {
		var priv, amt, blind fr.Element
		var pub, commit fr.Element
		var leafIdx int
		real := t < len(spec.Inputs)
		if real {
			in := spec.Inputs[t]
			priv = in.Priv
			amt = in.Note.Amount
			blind = in.Note.Blinding
			pub = in.Note.PubKey
			commit = in.Note.Commitment()
			leafIdx = in.LeafIndex
		} else {
			// dummy zero-value input — membership skipped in-circuit (isReal=0).
			priv = feUint(uint64(900000 + t))
			blind = feUint(uint64(800000 + t))
			amt = feUint(0)
			pub = PubKey(priv)
			commit = Commit(amt, pub, blind)
			leafIdx = 0
		}
		idxFe := feUint(uint64(leafIdx))
		sig := Sign(priv, commit, idxFe)
		nf := Nullifier(commit, idxFe, sig)

		c.InAmount[t] = v(amt)
		c.InPrivateKey[t] = v(priv)
		c.InBlinding[t] = v(blind)
		c.InPathIndex[t] = v(idxFe)
		c.InputNullifier[t] = v(nf)

		// pool + association paths (dev mode: same tree → same path)
		var poolSib, assocSib []fr.Element
		if real {
			poolSib, _ = spec.Pool.Path(leafIdx)
			assocSib, _ = spec.Assoc.Path(leafIdx)
			c.InAssocIndex[t] = v(idxFe)
		} else {
			poolSib = zeros[:Levels]
			assocSib = zeros[:Levels]
			c.InAssocIndex[t] = v(feUint(0))
		}
		for l := 0; l < Levels; l++ {
			c.InPathEls[t][l] = v(poolSib[l])
			c.InAssocEls[t][l] = v(assocSib[l])
		}
	}

	for t := 0; t < NOuts; t++ {
		c.OutAmount[t] = v(spec.Outputs[t].Amount)
		c.OutPubkey[t] = v(spec.Outputs[t].PubKey)
		c.OutBlinding[t] = v(spec.Outputs[t].Blinding)
		c.OutputCommitment[t] = v(spec.Outputs[t].Commitment())
	}

	// off-chain insertion: outputs fill the next free pair slot
	pairIndex := spec.Pool.Len() / 2
	pairSib, _ := spec.Pool.PairPath(pairIndex)
	for l := 0; l < Levels-1; l++ {
		c.PairPathEls[l] = v(pairSib[l])
	}
	c.PairIndex = v(feUint(uint64(pairIndex)))

	// NewRoot = root after appending the two output commitments
	spec.Pool.Insert(spec.Outputs[0].Commitment())
	spec.Pool.Insert(spec.Outputs[1].Commitment())
	c.NewRoot = v(spec.Pool.Root())

	return &c
}
