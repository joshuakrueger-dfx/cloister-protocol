// Copyright (c) 2026 DFX AG. All rights reserved. Proprietary and confidential.

package zk

import "github.com/consensys/gnark-crypto/ecc/bn254/fr"

// Levels is the Merkle-tree depth → 2^Levels ≈ 1.05M note capacity (the chosen
// anonymity-set size). Node = H(left, right); empty leaf = ZeroValue.
const Levels = 20

// ZeroValue is the empty-leaf constant. 0 is fine: a real commitment hashing to
// exactly 0 is cryptographically negligible.
func ZeroValue() fr.Element { var z fr.Element; return z }

// Zeros returns the empty-subtree root at each level (zeros[0] = empty leaf).
func Zeros() []fr.Element {
	z := make([]fr.Element, Levels+1)
	z[0] = ZeroValue()
	for i := 1; i <= Levels; i++ {
		z[i] = H(z[i-1], z[i-1])
	}
	return z
}

// Tree is a fixed-depth, append-only Poseidon2 Merkle tree.
type Tree struct {
	leaves []fr.Element
	zeros  []fr.Element
}

func NewTree() *Tree { return &Tree{zeros: Zeros()} }

func (t *Tree) Len() int { return len(t.leaves) }

// Insert appends a leaf and returns its index.
func (t *Tree) Insert(leaf fr.Element) int {
	t.leaves = append(t.leaves, leaf)
	return len(t.leaves) - 1
}

// nodeAt returns the node value at (level, index), treating missing nodes as empty.
func (t *Tree) layer(level int) []fr.Element {
	if level == 0 {
		return t.leaves
	}
	below := t.layer(level - 1)
	n := (len(below) + 1) / 2
	out := make([]fr.Element, n)
	for i := 0; i < n; i++ {
		l := t.zeros[level-1]
		r := t.zeros[level-1]
		if 2*i < len(below) {
			l = below[2*i]
		}
		if 2*i+1 < len(below) {
			r = below[2*i+1]
		}
		out[i] = H(l, r)
	}
	return out
}

// Root computes the current root.
func (t *Tree) Root() fr.Element {
	cur := append([]fr.Element(nil), t.leaves...)
	for lvl := 0; lvl < Levels; lvl++ {
		n := (len(cur) + 1) / 2
		nxt := make([]fr.Element, n)
		for i := 0; i < n; i++ {
			l, r := t.zeros[lvl], t.zeros[lvl]
			if 2*i < len(cur) {
				l = cur[2*i]
			}
			if 2*i+1 < len(cur) {
				r = cur[2*i+1]
			}
			nxt[i] = H(l, r)
		}
		cur = nxt
	}
	if len(cur) == 0 {
		return t.zeros[Levels]
	}
	return cur[0]
}

// Path returns the sibling at each level and the path index bits (LSB = level 0)
// for the leaf at `index` — exactly what the circuit consumes for membership.
func (t *Tree) Path(index int) (siblings []fr.Element, pathBits []int) {
	siblings = make([]fr.Element, Levels)
	pathBits = make([]int, Levels)
	cur := append([]fr.Element(nil), t.leaves...)
	idx := index
	for lvl := 0; lvl < Levels; lvl++ {
		sibIdx := idx ^ 1
		sib := t.zeros[lvl]
		if sibIdx < len(cur) {
			sib = cur[sibIdx]
		}
		siblings[lvl] = sib
		pathBits[lvl] = idx & 1
		// build next layer
		n := (len(cur) + 1) / 2
		nxt := make([]fr.Element, n)
		for i := 0; i < n; i++ {
			l, r := t.zeros[lvl], t.zeros[lvl]
			if 2*i < len(cur) {
				l = cur[2*i]
			}
			if 2*i+1 < len(cur) {
				r = cur[2*i+1]
			}
			nxt[i] = H(l, r)
		}
		cur = nxt
		idx /= 2
	}
	return siblings, pathBits
}

// PairPath returns the siblings (levels 1..Levels-1) and index bits for the
// level-1 PAIR node at pairIndex — used by the off-chain-insertion proof.
func (t *Tree) PairPath(pairIndex int) (siblings []fr.Element, bits []int) {
	siblings = make([]fr.Element, Levels-1)
	bits = make([]int, Levels-1)
	idx := pairIndex
	for lvl := 1; lvl <= Levels-1; lvl++ {
		layer := t.layer(lvl)
		sib := t.zeros[lvl]
		if sibIdx := idx ^ 1; sibIdx < len(layer) {
			sib = layer[sibIdx]
		}
		siblings[lvl-1] = sib
		bits[lvl-1] = idx & 1
		idx /= 2
	}
	return siblings, bits
}

// RootFromPath recomputes a root from a leaf + path (the native mirror of the
// in-circuit membership check).
func RootFromPath(leaf fr.Element, siblings []fr.Element, pathBits []int) fr.Element {
	cur := leaf
	for lvl := 0; lvl < len(siblings); lvl++ {
		if pathBits[lvl] == 0 {
			cur = H(cur, siblings[lvl])
		} else {
			cur = H(siblings[lvl], cur)
		}
	}
	return cur
}
