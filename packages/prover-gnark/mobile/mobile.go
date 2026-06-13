// Copyright (c) 2026 DFX AG. All rights reserved. Proprietary and confidential.

// Package mobile is the gomobile-bound surface of the Cloister prover. Every
// exported function uses only string/[]byte/error so `gomobile bind` produces a
// clean Swift/Kotlin API. It is the on-device proving entry point for the wallet.
package mobile

import (
	"encoding/json"
	"errors"
	"sync"

	"github.com/DFXswiss/cloister-protocol/prover-gnark/prover"
	"github.com/DFXswiss/cloister-protocol/prover-gnark/zk"
)

var (
	mu sync.Mutex
	pv *prover.Prover
)

// Init loads the circuit + proving/verifying keys from keysDir (the directory in
// the app bundle holding circuit.r1cs, pk.bin, vk.bin). Call once at startup. It is
// idempotent and safe to call from any thread.
func Init(keysDir string) error {
	mu.Lock()
	defer mu.Unlock()
	if pv != nil {
		return nil
	}
	p, err := prover.Load(keysDir)
	if err != nil {
		return err
	}
	pv = p
	return nil
}

// Ready reports whether Init has completed successfully.
func Ready() bool {
	mu.Lock()
	defer mu.Unlock()
	return pv != nil
}

// proveResult is the JSON returned to the SDK — proof in both the raw bytes form
// and the (a,b,c) struct the ShieldedPool consumes, plus the 10 public signals.
type proveResult struct {
	ProofHex string       `json:"proofHex"`
	A        [2]string    `json:"a"`
	B        [2][2]string `json:"b"`
	C        [2]string    `json:"c"`
	Public   [10]string   `json:"publicSignals"`
}

// Prove takes the SDK witness JSON (the buildWitness() output) and returns a JSON
// proof. This replaces snarkjs.fullProve / rapidsnark entirely.
func Prove(witnessInputJSON string) (string, error) {
	mu.Lock()
	p := pv
	mu.Unlock()
	if p == nil {
		return "", errors.New("prover not initialized — call Init(keysDir) first")
	}

	var wi zk.WitnessInput
	if err := json.Unmarshal([]byte(witnessInputJSON), &wi); err != nil {
		return "", err
	}
	res, err := p.ProveWitness(&wi)
	if err != nil {
		return "", err
	}
	out := proveResult{
		ProofHex: "0x" + toHex(res.ProofBytes),
		A:        res.A,
		B:        res.B,
		C:        res.C,
		Public:   res.Public,
	}
	b, err := json.Marshal(out)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// Hash computes Poseidon2 over a JSON array of decimal/hex field elements and
// returns the decimal result. The SDK's poseidon.js delegates here so the Merkle
// tree, notes and circuit all share one hash implementation.
func Hash(itemsJSON string) (string, error) {
	var items []string
	if err := json.Unmarshal([]byte(itemsJSON), &items); err != nil {
		return "", err
	}
	return zk.HashDecimal(items)
}

const hexdigits = "0123456789abcdef"

func toHex(b []byte) string {
	out := make([]byte, len(b)*2)
	for i, c := range b {
		out[i*2] = hexdigit(c >> 4)
		out[i*2+1] = hexdigit(c & 0x0f)
	}
	return string(out)
}

func hexdigit(n byte) byte { return hexdigits[n] }
