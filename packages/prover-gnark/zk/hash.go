// Copyright (c) 2026 DFX AG. All rights reserved. Proprietary and confidential.

// Package zk implements the Cloister shielded-pool zero-knowledge layer in gnark
// (Groth16 over BN254). All cryptographic primitives are implemented here so the
// prover, the on-chain verifier and the wallet share one consistent scheme.
package zk

import (
	"fmt"
	"math/big"

	"github.com/consensys/gnark-crypto/ecc/bn254/fr"
	"github.com/consensys/gnark-crypto/ecc/bn254/fr/poseidon2"
)

// H hashes field elements with Poseidon2 in Merkle–Damgård mode. This MUST stay
// bit-for-bit identical to the in-circuit hasher (gnark std/hash/poseidon2), which
// is the whole point of using one library for both sides.
func H(inputs ...fr.Element) fr.Element {
	h := poseidon2.NewMerkleDamgardHasher()
	for i := range inputs {
		b := inputs[i].Bytes()
		_, _ = h.Write(b[:])
	}
	var out fr.Element
	out.SetBytes(h.Sum(nil))
	return out
}

// HFromUint is a small convenience for tests/fixtures.
func HFromUint(xs ...uint64) fr.Element {
	in := make([]fr.Element, len(xs))
	for i, x := range xs {
		in[i].SetUint64(x)
	}
	return H(in...)
}

// ParseFE parses a decimal (or 0x-hex) string into a field element.
func ParseFE(s string) (fr.Element, error) {
	var fe fr.Element
	base, t := 10, s
	if len(s) >= 2 && s[0] == '0' && (s[1] == 'x' || s[1] == 'X') {
		base, t = 16, s[2:]
	}
	b, ok := new(big.Int).SetString(t, base)
	if !ok {
		return fe, fmt.Errorf("bad field element %q", s)
	}
	fe.SetBigInt(b)
	return fe, nil
}

// HashDecimal hashes the given decimal/hex field elements with Poseidon2 and
// returns the result as a decimal string. This is the single hash entry point the
// SDK's poseidon.js delegates to, guaranteeing tree/note/circuit consistency.
func HashDecimal(items []string) (string, error) {
	in := make([]fr.Element, len(items))
	for i, s := range items {
		fe, err := ParseFE(s)
		if err != nil {
			return "", err
		}
		in[i] = fe
	}
	out := H(in...)
	var b big.Int
	out.BigInt(&b)
	return b.Text(10), nil
}
