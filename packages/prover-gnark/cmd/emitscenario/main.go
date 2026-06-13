// Copyright (c) 2026 DFX AG. All rights reserved. Proprietary and confidential.

// Command emitscenario produces a real Groth16 proof + full transact calldata for a
// deposit scenario, so the Hardhat E2E test can drive ShieldedPool.transact with a
// genuine proof. The extDataHash is supplied by the caller (computed in JS as
// keccak(abi.encode(extData)) % FIELD) so it matches what the contract recomputes.
package main

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"

	"github.com/consensys/gnark-crypto/ecc/bn254/fr"

	"github.com/DFXswiss/cloister-protocol/prover-gnark/prover"
	"github.com/DFXswiss/cloister-protocol/prover-gnark/zk"
)

type scenario struct {
	Amount      string `json:"amount"`      // deposit amount (wei), decimal
	ExtDataHash string `json:"extDataHash"` // keccak(extData) % FIELD, decimal
}

type output struct {
	OldRoot         string       `json:"oldRoot"`
	NewRoot         string       `json:"newRoot"`
	AssociationRoot string       `json:"associationRoot"`
	PublicAmount    string       `json:"publicAmount"`
	PairIndex       string       `json:"pairIndex"`
	Nullifiers      [2]string    `json:"nullifiers"`
	Commitments     [2]string    `json:"commitments"`
	ProofHex        string       `json:"proofHex"`
	A               [2]string    `json:"a"`
	B               [2][2]string `json:"b"`
	C               [2]string    `json:"c"`
}

func feUint(x uint64) fr.Element { var e fr.Element; e.SetUint64(x); return e }

func main() {
	if len(os.Args) < 4 {
		fmt.Fprintln(os.Stderr, "usage: emitscenario <keysDir> <scenario.json> <out.json>")
		os.Exit(1)
	}
	keysDir, scenarioPath, outPath := os.Args[1], os.Args[2], os.Args[3]

	raw, err := os.ReadFile(scenarioPath)
	must(err)
	var sc scenario
	must(json.Unmarshal(raw, &sc))

	amount, err := zk.ParseFE(sc.Amount)
	must(err)
	extHash, err := zk.ParseFE(sc.ExtDataHash)
	must(err)

	// Deposit: no real inputs, outputs sum to `amount`, publicAmount = +amount.
	pool := zk.NewTree()
	out0 := zk.Note{Amount: amount, PubKey: zk.PubKey(feUint(7777)), Blinding: feUint(31)}
	out1 := zk.Note{Amount: feUint(0), PubKey: zk.PubKey(feUint(8888)), Blinding: feUint(32)}
	spec := &zk.TxSpec{
		Pool:         pool,
		Assoc:        pool,
		Inputs:       nil,
		Outputs:      [2]zk.Note{out0, out1},
		PublicAmount: amount,
		ExtDataHash:  extHash,
	}

	p, err := prover.Load(keysDir)
	must(err)
	res, err := p.Prove(spec)
	must(err)

	pub := res.Public // hex strings, on-chain order
	o := output{
		OldRoot:         pub[0],
		PublicAmount:    pub[1],
		Nullifiers:      [2]string{pub[3], pub[4]},
		Commitments:     [2]string{pub[5], pub[6]},
		NewRoot:         pub[7],
		PairIndex:       pub[8],
		AssociationRoot: pub[9],
		ProofHex:        "0x" + hex.EncodeToString(res.ProofBytes),
		A:               res.A,
		B:               res.B,
		C:               res.C,
	}
	data, _ := json.MarshalIndent(o, "", "  ")
	must(os.WriteFile(outPath, data, 0o644))
	fmt.Printf("wrote %s (deposit %s, oldRoot=%s… newRoot=%s…)\n", outPath, sc.Amount, o.OldRoot[:10], o.NewRoot[:10])
}

func must(err error) {
	if err != nil {
		panic(err)
	}
}
