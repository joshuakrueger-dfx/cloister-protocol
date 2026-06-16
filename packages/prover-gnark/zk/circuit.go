// Copyright (c) 2026 DFX AG. Licensed under the MIT License (see LICENSE).

package zk

import (
	"github.com/consensys/gnark/frontend"
	"github.com/consensys/gnark/std/hash/poseidon2"
)

// NIns / NOuts: a 2-in / 2-out shielded transaction (deposit, internal pay, withdraw).
const (
	NIns  = 2
	NOuts = 2
	// amountBits bounds note amounts so field-wraparound cannot forge value.
	amountBits = 248
)

// TxCircuit is the Cloister shielded-pool transaction circuit.
//
// Public signals (THIS ORDER must match the on-chain verifier's pub[] array):
//
//	0 Root              — pool Merkle root the inputs are proven against
//	1 PublicAmount      — extAmount - fee, field-encoded (deposit +, withdraw p-|x|)
//	2 ExtDataHash       — binds recipient/relayer/fee/encrypted outputs
//	3 InputNullifier[0]
//	4 InputNullifier[1]
//	5 OutputCommitment[0]
//	6 OutputCommitment[1]
//	7 NewRoot           — root after inserting the two outputs as a pair node
//	8 PairIndex         — insertion slot (= laneNextIndex/2)
//	9 AssociationRoot   — compliance: inputs proven to be in the ASP good-set
type TxCircuit struct {
	Root             frontend.Variable    `gnark:",public"`
	PublicAmount     frontend.Variable    `gnark:",public"`
	ExtDataHash      frontend.Variable    `gnark:",public"`
	InputNullifier   [NIns]frontend.Variable  `gnark:",public"`
	OutputCommitment [NOuts]frontend.Variable `gnark:",public"`
	NewRoot          frontend.Variable    `gnark:",public"`
	PairIndex        frontend.Variable    `gnark:",public"`
	AssociationRoot  frontend.Variable    `gnark:",public"`

	// --- private: inputs ---
	InAmount     [NIns]frontend.Variable
	InPrivateKey [NIns]frontend.Variable
	InBlinding   [NIns]frontend.Variable
	InPathIndex  [NIns]frontend.Variable
	InPathEls    [NIns][Levels]frontend.Variable
	InAssocIndex [NIns]frontend.Variable
	InAssocEls   [NIns][Levels]frontend.Variable

	// --- private: outputs ---
	OutAmount   [NOuts]frontend.Variable
	OutPubkey   [NOuts]frontend.Variable
	OutBlinding [NOuts]frontend.Variable

	// --- private: off-chain insertion (pair node sits at level 1 → Levels-1 siblings) ---
	PairPathEls [Levels - 1]frontend.Variable
}

func (c *TxCircuit) Define(api frontend.API) error {
	// fresh Poseidon2 hashers (each matches native H exactly — see hash_test)
	h := func(in ...frontend.Variable) frontend.Variable {
		hsh, _ := poseidon2.New(api)
		hsh.Write(in...)
		return hsh.Sum()
	}
	climb := func(leaf, idx frontend.Variable, sibs []frontend.Variable) frontend.Variable {
		bits := api.ToBinary(idx, len(sibs))
		cur := leaf
		for i := 0; i < len(sibs); i++ {
			left := api.Select(bits[i], sibs[i], cur)
			right := api.Select(bits[i], cur, sibs[i])
			cur = h(left, right)
		}
		return cur
	}

	sumIn := frontend.Variable(0)
	for t := 0; t < NIns; t++ {
		pub := h(c.InPrivateKey[t])
		commit := h(c.InAmount[t], pub, c.InBlinding[t])
		sig := h(c.InPrivateKey[t], commit, c.InPathIndex[t])
		nf := h(commit, c.InPathIndex[t], sig)
		api.AssertIsEqual(nf, c.InputNullifier[t])

		api.ToBinary(c.InAmount[t], amountBits) // range: 0 ≤ amount < 2^248

		isReal := api.Sub(1, api.IsZero(c.InAmount[t])) // dummy (0-value) inputs skip membership
		// pool membership
		root := climb(commit, c.InPathIndex[t], c.InPathEls[t][:])
		api.AssertIsEqual(api.Mul(api.Sub(root, c.Root), isReal), 0)
		// compliance: association-set membership (good-set inclusion)
		aroot := climb(commit, c.InAssocIndex[t], c.InAssocEls[t][:])
		api.AssertIsEqual(api.Mul(api.Sub(aroot, c.AssociationRoot), isReal), 0)

		sumIn = api.Add(sumIn, c.InAmount[t])
	}

	sumOut := frontend.Variable(0)
	for t := 0; t < NOuts; t++ {
		commit := h(c.OutAmount[t], c.OutPubkey[t], c.OutBlinding[t])
		api.AssertIsEqual(commit, c.OutputCommitment[t])
		api.ToBinary(c.OutAmount[t], amountBits)
		sumOut = api.Add(sumOut, c.OutAmount[t])
	}

	// no in-tx double-spend
	api.AssertIsDifferent(c.InputNullifier[0], c.InputNullifier[1])

	// value conservation: sumIn + publicAmount == sumOut (in the field)
	api.AssertIsEqual(api.Add(sumIn, c.PublicAmount), sumOut)

	// ExtDataHash is a declared public input, so Groth16 binds it cryptographically into the
	// proof — a verifier cannot drop or alter it without invalidating the proof. It is
	// deliberately NOT relation-constrained inside the circuit: the binding of the hash to the
	// actual extData (recipient, extAmount, relayer, fee, encrypted outputs) is enforced
	// ON-CHAIN, where ShieldedPool._transact recomputes keccak256(abi.encode(extData)) % p and
	// passes that as this public input (see the "tampered extData reverts" e2e test). The line
	// below is a deliberate pass-through, not a binding; any other consumer of these proofs MUST
	// likewise recompute the hash from extData rather than trust a supplied value.
	api.AssertIsEqual(c.ExtDataHash, c.ExtDataHash)

	// off-chain insertion: prove Root → NewRoot by replacing the empty pair slot
	// (H(0,0)) at PairIndex with H(out0,out1), same siblings.
	z1 := h(frontend.Variable(0), frontend.Variable(0))
	pairNode := h(c.OutputCommitment[0], c.OutputCommitment[1])
	oldRoot := climb(z1, c.PairIndex, c.PairPathEls[:])
	api.AssertIsEqual(oldRoot, c.Root)
	newRoot := climb(pairNode, c.PairIndex, c.PairPathEls[:])
	api.AssertIsEqual(newRoot, c.NewRoot)

	return nil
}
