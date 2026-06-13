// Copyright (c) 2026 DFX AG. All rights reserved. Proprietary and confidential.

package zk

import (
	"testing"

	"github.com/consensys/gnark-crypto/ecc/bn254/fr"
)

func TestMerklePathRecomputesRoot(t *testing.T) {
	tree := NewTree()
	var commits []fr.Element
	for i := 0; i < 7; i++ {
		var priv, blind fr.Element
		priv.SetUint64(uint64(1000 + i))
		blind.SetUint64(uint64(7000 + i))
		var amt fr.Element
		amt.SetUint64(uint64(100 * (i + 1)))
		c := Commit(amt, PubKey(priv), blind)
		commits = append(commits, c)
		tree.Insert(c)
	}
	root := tree.Root()
	for i := range commits {
		sib, bits := tree.Path(i)
		got := RootFromPath(commits[i], sib, bits)
		if !got.Equal(&root) {
			t.Fatalf("leaf %d: path does not recompute root", i)
		}
	}
}

func TestNoteAndNullifierDeterministic(t *testing.T) {
	var priv, blind, amt, idx fr.Element
	priv.SetUint64(1234567890123456789)
	blind.SetUint64(42)
	amt.SetUint64(250)
	idx.SetUint64(3)

	c1 := Commit(amt, PubKey(priv), blind)
	c2 := Commit(amt, PubKey(priv), blind)
	if !c1.Equal(&c2) {
		t.Fatal("commitment not deterministic")
	}
	nf1 := Nullifier(c1, idx, Sign(priv, c1, idx))
	nf2 := Nullifier(c1, idx, Sign(priv, c1, idx))
	if !nf1.Equal(&nf2) {
		t.Fatal("nullifier not deterministic")
	}
	// different position → different nullifier (prevents replay at another index)
	var idx2 fr.Element
	idx2.SetUint64(4)
	nf3 := Nullifier(c1, idx2, Sign(priv, c1, idx2))
	if nf1.Equal(&nf3) {
		t.Fatal("nullifier must depend on position")
	}
}
