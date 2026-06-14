// Copyright (c) 2026 DFX AG. All rights reserved. Proprietary and confidential.

// Command depositclient mimics exactly what the wallet's native ProveDeposit does:
// given the relayer's /v1/deposit/prepare JSON + an amount + owner key, it builds the
// deposit witness and proves it, emitting the /v1/deposit/submit payload. Used to
// verify the relayer + Base Sepolia E2E before the on-device build.
//
// usage: depositclient <keysDir> <amount> <ownerPriv> <prepare.json>
package main

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/DFXswiss/cloister-protocol/prover-gnark/prover"
	"github.com/DFXswiss/cloister-protocol/prover-gnark/zk"
	"github.com/consensys/gnark-crypto/ecc/bn254/fr"
	"github.com/consensys/gnark/logger"
)

type prep struct {
	Root        string   `json:"root"`
	PairIndex   int      `json:"pairIndex"`
	PairPathEls []string `json:"pairPathEls"`
	ExtDataHash string   `json:"extDataHash"`
}

func must(e error) { if e != nil { panic(e) } }

func main() {
	if len(os.Args) < 5 {
		fmt.Fprintln(os.Stderr, "usage: depositclient <keysDir> <amount> <ownerPriv> <prepare.json>")
		os.Exit(1)
	}
	logger.Disable() // keep stdout clean for the JSON payload
	raw, err := os.ReadFile(os.Args[4])
	must(err)
	var pp prep
	must(json.Unmarshal(raw, &pp))

	amount, err := zk.ParseFE(os.Args[2])
	must(err)
	ownerPriv, err := zk.ParseFE(os.Args[3])
	must(err)
	root, err := zk.ParseFE(pp.Root)
	must(err)
	extHash, err := zk.ParseFE(pp.ExtDataHash)
	must(err)
	els := make([]fr.Element, len(pp.PairPathEls))
	for i, s := range pp.PairPathEls {
		els[i], err = zk.ParseFE(s)
		must(err)
	}

	p, err := prover.Load(os.Args[1])
	must(err)
	wi := zk.ToWitnessInput(zk.BuildDepositAssignment(zk.DepositParams{
		Amount: amount, OwnerPub: zk.PubKey(ownerPriv), Root: root,
		PairIndex: pp.PairIndex, PairPathEls: els, ExtDataHash: extHash,
	}))
	res, err := p.ProveWitness(&wi)
	must(err)

	out, _ := json.Marshal(map[string]any{"a": res.A, "b": res.B, "c": res.C, "publicSignals": res.Public})
	fmt.Println(string(out))
}
