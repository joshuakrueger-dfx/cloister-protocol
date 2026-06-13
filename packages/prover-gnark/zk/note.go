// Copyright (c) 2026 DFX AG. All rights reserved. Proprietary and confidential.

package zk

import "github.com/consensys/gnark-crypto/ecc/bn254/fr"

// Cloister note scheme (Poseidon2, no elliptic-curve key).
//
// Using a plain field-element private key with pubKey = H(privKey) instead of a
// BabyJubJub scalar deliberately removes the "s vs s+order produce two nullifiers
// for one note" self-double-spend class entirely: a field element has exactly one
// hash, so a note has exactly one nullifier. Ownership is still bound — only the
// privKey holder can produce the signature that goes into the nullifier.
//
//	pubKey     = H(privKey)
//	commitment = H(amount, pubKey, blinding)
//	signature  = H(privKey, commitment, leafIndex)
//	nullifier  = H(commitment, leafIndex, signature)

// PubKey derives the note public key from the private key.
func PubKey(priv fr.Element) fr.Element { return H(priv) }

// Commit computes a note commitment (the Merkle-tree leaf).
func Commit(amount, pubKey, blinding fr.Element) fr.Element {
	return H(amount, pubKey, blinding)
}

// Sign binds a spend to the private key + position (deterministic, non-malleable).
func Sign(priv, commitment, leafIndex fr.Element) fr.Element {
	return H(priv, commitment, leafIndex)
}

// Nullifier marks a note spent. Derived from commitment + position + signature,
// so it is unique per (note, position) and only the owner can produce it.
func Nullifier(commitment, leafIndex, sig fr.Element) fr.Element {
	return H(commitment, leafIndex, sig)
}

// Note is a spendable shielded UTXO held by the owner of privKey.
type Note struct {
	Amount   fr.Element
	PubKey   fr.Element
	Blinding fr.Element
}

func (n Note) Commitment() fr.Element { return Commit(n.Amount, n.PubKey, n.Blinding) }
