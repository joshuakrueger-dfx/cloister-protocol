// Copyright (c) 2026 DFX AG. All rights reserved. Proprietary and confidential.

package zk

import "github.com/consensys/gnark-crypto/ecc/bn254/fr"

// DepositParams is everything the device needs to prove a deposit (shield) WITHOUT a
// full local tree. The tree-dependent context (root, pair-slot index + siblings) is
// supplied by the relayer/indexer; everything else is derived here. extDataHash is the
// keccak(extData)%p the relayer will submit on-chain.
type DepositParams struct {
	Amount       fr.Element   // deposited amount (note value)
	OwnerPub     fr.Element   // recipient note owner = H(ownerPriv)
	Root         fr.Element   // current pool root
	PairIndex    int          // laneNextIndex/2 (the empty pair slot)
	PairPathEls  []fr.Element // Levels-1 siblings of the level-1 pair node
	ExtDataHash  fr.Element
}

func randFr() fr.Element { var e fr.Element; _, _ = e.SetRandom(); return e }

func bitsOf(x, n int) []int {
	b := make([]int, n)
	for i := 0; i < n; i++ {
		b[i] = (x >> uint(i)) & 1
	}
	return b
}

// BuildDepositAssignment constructs a fully-populated deposit witness: two dummy
// (zero-value) inputs, two outputs (the note + a zero note), value conserved by
// publicAmount = +Amount. Random blindings/dummy keys are drawn here so each deposit
// has unique nullifiers (the circuit requires the two input nullifiers to differ).
func BuildDepositAssignment(p DepositParams) *TxCircuit {
	var c TxCircuit
	zeros := Zeros()
	zero := ZeroValue()

	// two dummy inputs (amount 0 → membership skipped in-circuit)
	for t := 0; t < NIns; t++ {
		priv := randFr()
		blind := randFr()
		amt := fr.NewElement(0)
		pub := PubKey(priv)
		commit := Commit(amt, pub, blind)
		idx := fr.NewElement(0)
		sig := Sign(priv, commit, idx)
		nf := Nullifier(commit, idx, sig)
		c.InAmount[t] = v(amt)
		c.InPrivateKey[t] = v(priv)
		c.InBlinding[t] = v(blind)
		c.InPathIndex[t] = v(idx)
		c.InAssocIndex[t] = v(idx)
		c.InputNullifier[t] = v(nf)
		for l := 0; l < Levels; l++ {
			c.InPathEls[t][l] = v(zeros[l])
			c.InAssocEls[t][l] = v(zeros[l])
		}
	}

	// outputs: [amount → owner, 0 → owner]
	b0, b1 := randFr(), randFr()
	a0 := p.Amount
	a1 := fr.NewElement(0)
	commit0 := Commit(a0, p.OwnerPub, b0)
	commit1 := Commit(a1, p.OwnerPub, b1)
	c.OutAmount[0] = v(a0)
	c.OutAmount[1] = v(a1)
	c.OutPubkey[0] = v(p.OwnerPub)
	c.OutPubkey[1] = v(p.OwnerPub)
	c.OutBlinding[0] = v(b0)
	c.OutBlinding[1] = v(b1)
	c.OutputCommitment[0] = v(commit0)
	c.OutputCommitment[1] = v(commit1)

	// public + insertion context
	c.Root = v(p.Root)
	c.PublicAmount = v(p.Amount)
	c.ExtDataHash = v(p.ExtDataHash)
	c.AssociationRoot = v(p.Root) // dev mode: association set == pool
	c.PairIndex = v(feUintFromInt(p.PairIndex))
	for l := 0; l < Levels-1; l++ {
		c.PairPathEls[l] = v(p.PairPathEls[l])
	}

	// NewRoot = root after replacing the empty pair slot (H(0,0)) with H(out0,out1)
	pairNode := H(commit0, commit1)
	newRoot := RootFromPath(pairNode, p.PairPathEls, bitsOf(p.PairIndex, Levels-1))
	c.NewRoot = v(newRoot)
	_ = zero
	return &c
}

func feUintFromInt(x int) fr.Element { var e fr.Element; e.SetInt64(int64(x)); return e }
