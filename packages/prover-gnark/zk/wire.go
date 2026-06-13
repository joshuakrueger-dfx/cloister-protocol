// Copyright (c) 2026 DFX AG. All rights reserved. Proprietary and confidential.

package zk

import (
	"fmt"
	"math/big"

	"github.com/consensys/gnark/frontend"
)

// WitnessInput is the JSON wire format the SDK already emits from buildWitness()
// (decimal-string field elements). Field names match packages/sdk/src/witness.js
// verbatim so the native prover is a drop-in replacement for snarkjs.fullProve.
type WitnessInput struct {
	Root              string     `json:"root"`
	PublicAmount      string     `json:"publicAmount"`
	ExtDataHash       string     `json:"extDataHash"`
	InputNullifier    []string   `json:"inputNullifier"`   // 2
	OutputCommitment  []string   `json:"outputCommitment"` // 2
	NewRoot           string     `json:"newRoot"`
	PairPathIndices   string     `json:"pairPathIndices"` // == pair slot index
	AssociationRoot   string     `json:"associationRoot"`
	PairPathElements  []string   `json:"pairPathElements"`  // Levels-1
	InAspPathIndices  []string   `json:"inAspPathIndices"`  // 2
	InAspPathElements [][]string `json:"inAspPathElements"` // 2 x Levels
	InAmount          []string   `json:"inAmount"`          // 2
	InPrivateKey      []string   `json:"inPrivateKey"`      // 2
	InBlinding        []string   `json:"inBlinding"`        // 2
	InPathIndices     []string   `json:"inPathIndices"`     // 2
	InPathElements    [][]string `json:"inPathElements"`    // 2 x Levels
	OutAmount         []string   `json:"outAmount"`         // 2
	OutPubkey         []string   `json:"outPubkey"`         // 2
	OutBlinding       []string   `json:"outBlinding"`       // 2
}

// parseFE parses a decimal (or 0x-hex) field element into a frontend.Variable.
func parseFE(s string) (frontend.Variable, error) {
	base := 10
	t := s
	if len(s) >= 2 && s[0] == '0' && (s[1] == 'x' || s[1] == 'X') {
		base, t = 16, s[2:]
	}
	n, ok := new(big.Int).SetString(t, base)
	if !ok {
		return nil, fmt.Errorf("bad field element %q", s)
	}
	return n, nil
}

func parseArr(ss []string, want int) ([]frontend.Variable, error) {
	if len(ss) != want {
		return nil, fmt.Errorf("expected %d elements, got %d", want, len(ss))
	}
	out := make([]frontend.Variable, want)
	for i, s := range ss {
		v, err := parseFE(s)
		if err != nil {
			return nil, err
		}
		out[i] = v
	}
	return out, nil
}

// Assignment maps the SDK witness JSON onto the gnark circuit. It performs no
// hashing — every value (commitments, nullifiers, roots) was produced by the SDK
// using the SAME Poseidon2 the circuit enforces, so the assignment is consistent.
func (wi *WitnessInput) Assignment() (*TxCircuit, error) {
	var c TxCircuit
	var err error
	set := func(dst *frontend.Variable, s string) {
		if err != nil {
			return
		}
		var v frontend.Variable
		v, err = parseFE(s)
		*dst = v
	}

	set(&c.Root, wi.Root)
	set(&c.PublicAmount, wi.PublicAmount)
	set(&c.ExtDataHash, wi.ExtDataHash)
	set(&c.NewRoot, wi.NewRoot)
	set(&c.PairIndex, wi.PairPathIndices)
	set(&c.AssociationRoot, wi.AssociationRoot)

	inNull, e := parseArr(wi.InputNullifier, NIns)
	outCommit, e2 := parseArr(wi.OutputCommitment, NOuts)
	pairEls, e3 := parseArr(wi.PairPathElements, Levels-1)
	if err == nil {
		err = firstErr(e, e2, e3)
	}
	if err != nil {
		return nil, err
	}
	for i := 0; i < NIns; i++ {
		c.InputNullifier[i] = inNull[i]
	}
	for i := 0; i < NOuts; i++ {
		c.OutputCommitment[i] = outCommit[i]
	}
	for i := 0; i < Levels-1; i++ {
		c.PairPathEls[i] = pairEls[i]
	}

	for t := 0; t < NIns; t++ {
		set(&c.InAmount[t], wi.InAmount[t])
		set(&c.InPrivateKey[t], wi.InPrivateKey[t])
		set(&c.InBlinding[t], wi.InBlinding[t])
		set(&c.InPathIndex[t], wi.InPathIndices[t])
		set(&c.InAssocIndex[t], wi.InAspPathIndices[t])
		pe, ea := parseArr(wi.InPathElements[t], Levels)
		ae, eb := parseArr(wi.InAspPathElements[t], Levels)
		if err == nil {
			err = firstErr(ea, eb)
		}
		if err != nil {
			return nil, err
		}
		for l := 0; l < Levels; l++ {
			c.InPathEls[t][l] = pe[l]
			c.InAssocEls[t][l] = ae[l]
		}
	}
	for t := 0; t < NOuts; t++ {
		set(&c.OutAmount[t], wi.OutAmount[t])
		set(&c.OutPubkey[t], wi.OutPubkey[t])
		set(&c.OutBlinding[t], wi.OutBlinding[t])
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func firstErr(errs ...error) error {
	for _, e := range errs {
		if e != nil {
			return e
		}
	}
	return nil
}

// decStr renders a frontend.Variable holding a *big.Int as a decimal string
// (the same encoding the SDK emits via BigInt.toString()).
func decStr(x frontend.Variable) string {
	if b, ok := x.(*big.Int); ok {
		return b.Text(10)
	}
	return fmt.Sprintf("%v", x)
}

// ToWitnessInput serializes an assignment into the SDK wire format — used by
// tooling and the round-trip test to lock the field mapping.
func ToWitnessInput(c *TxCircuit) WitnessInput {
	wi := WitnessInput{
		Root:             decStr(c.Root),
		PublicAmount:     decStr(c.PublicAmount),
		ExtDataHash:      decStr(c.ExtDataHash),
		NewRoot:          decStr(c.NewRoot),
		PairPathIndices:  decStr(c.PairIndex),
		AssociationRoot:  decStr(c.AssociationRoot),
		InputNullifier:   []string{decStr(c.InputNullifier[0]), decStr(c.InputNullifier[1])},
		OutputCommitment: []string{decStr(c.OutputCommitment[0]), decStr(c.OutputCommitment[1])},
	}
	for i := 0; i < Levels-1; i++ {
		wi.PairPathElements = append(wi.PairPathElements, decStr(c.PairPathEls[i]))
	}
	for t := 0; t < NIns; t++ {
		wi.InAmount = append(wi.InAmount, decStr(c.InAmount[t]))
		wi.InPrivateKey = append(wi.InPrivateKey, decStr(c.InPrivateKey[t]))
		wi.InBlinding = append(wi.InBlinding, decStr(c.InBlinding[t]))
		wi.InPathIndices = append(wi.InPathIndices, decStr(c.InPathIndex[t]))
		wi.InAspPathIndices = append(wi.InAspPathIndices, decStr(c.InAssocIndex[t]))
		var pe, ae []string
		for l := 0; l < Levels; l++ {
			pe = append(pe, decStr(c.InPathEls[t][l]))
			ae = append(ae, decStr(c.InAssocEls[t][l]))
		}
		wi.InPathElements = append(wi.InPathElements, pe)
		wi.InAspPathElements = append(wi.InAspPathElements, ae)
	}
	for t := 0; t < NOuts; t++ {
		wi.OutAmount = append(wi.OutAmount, decStr(c.OutAmount[t]))
		wi.OutPubkey = append(wi.OutPubkey, decStr(c.OutPubkey[t]))
		wi.OutBlinding = append(wi.OutBlinding, decStr(c.OutBlinding[t]))
	}
	return wi
}
