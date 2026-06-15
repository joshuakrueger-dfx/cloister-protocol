// Copyright (c) 2026 DFX AG. All rights reserved. Proprietary and confidential.

// Package mobile is the gomobile-bound surface of the Cloister prover. Every
// exported function uses only string/[]byte/error so `gomobile bind` produces a
// clean Swift/Kotlin API. It is the on-device proving entry point for the wallet.
package mobile

import (
	"encoding/json"
	"errors"
	"sync"

	"github.com/consensys/gnark-crypto/ecc/bn254/fr"

	"github.com/DFXswiss/cloister-protocol/prover-gnark/onchain"
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

// depositParams is the JSON the wallet passes to ProveDeposit. root/pairIndex/
// pairPathEls/extDataHash come from the relayer's /v1/deposit/prepare; ownerPriv is
// the device's spend key (the note owner).
type depositParams struct {
	Amount      string   `json:"amount"`
	OwnerPriv   string   `json:"ownerPriv"`
	Root        string   `json:"root"`
	PairIndex   int      `json:"pairIndex"`
	PairPathEls []string `json:"pairPathEls"`
	ExtDataHash string   `json:"extDataHash"`
}

// ProveDeposit builds + proves a deposit (shield) witness entirely on-device from the
// relayer-supplied insertion context — no JS SDK, no tree. Returns the same proof JSON
// as Prove. This is the native shielding entry point for the wallet.
func ProveDeposit(paramsJSON string) (string, error) {
	mu.Lock()
	p := pv
	mu.Unlock()
	if p == nil {
		return "", errors.New("prover not initialized — call Init(keysDir) first")
	}
	var dp depositParams
	if err := json.Unmarshal([]byte(paramsJSON), &dp); err != nil {
		return "", err
	}
	amount, err := zk.ParseFE(dp.Amount)
	if err != nil {
		return "", err
	}
	ownerPriv, err := zk.ParseFE(dp.OwnerPriv)
	if err != nil {
		return "", err
	}
	root, err := zk.ParseFE(dp.Root)
	if err != nil {
		return "", err
	}
	extHash, err := zk.ParseFE(dp.ExtDataHash)
	if err != nil {
		return "", err
	}
	pathEls := make([]fr.Element, len(dp.PairPathEls))
	for i, s := range dp.PairPathEls {
		if pathEls[i], err = zk.ParseFE(s); err != nil {
			return "", err
		}
	}
	assignment := zk.BuildDepositAssignment(zk.DepositParams{
		Amount:      amount,
		OwnerPub:    zk.PubKey(ownerPriv),
		Root:        root,
		PairIndex:   dp.PairIndex,
		PairPathEls: pathEls,
		ExtDataHash: extHash,
	})
	wi := zk.ToWitnessInput(assignment)
	res, err := p.ProveWitness(&wi)
	if err != nil {
		return "", err
	}
	out := proveResult{ProofHex: "0x" + toHex(res.ProofBytes), A: res.A, B: res.B, C: res.C, Public: res.Public}
	b, err := json.Marshal(out)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

type depositDirectParams struct {
	RPC         string `json:"rpc"`
	Pool        string `json:"pool"`
	Token       string `json:"token"`
	DeployerKey string `json:"deployerKey"`
	Amount      string `json:"amount"`
	OwnerPriv   string `json:"ownerPriv"`
}

// DepositDirect builds + proves a deposit on-device AND broadcasts it straight to the
// public RPC (no relayer, no LAN) — the always-works fallback path. Returns JSON
// { txHash, basescan, proveMs }.
func DepositDirect(paramsJSON string) (string, error) {
	mu.Lock()
	p := pv
	mu.Unlock()
	if p == nil {
		return "", errors.New("prover not initialized — call Init(keysDir) first")
	}
	var dp depositDirectParams
	if err := json.Unmarshal([]byte(paramsJSON), &dp); err != nil {
		return "", err
	}
	res, err := onchain.DepositAndSubmit(p, onchain.Config{
		RPC: dp.RPC, PoolAddr: dp.Pool, TokenAddr: dp.Token,
		DeployerKey: dp.DeployerKey, Amount: dp.Amount, OwnerPriv: dp.OwnerPriv,
	})
	if err != nil {
		return "", err
	}
	b, _ := json.Marshal(map[string]any{
		"txHash":   res.TxHash,
		"basescan": "https://sepolia.basescan.org/tx/" + res.TxHash,
		"proveMs":  res.ProveMs,
	})
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
