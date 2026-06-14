// Copyright (c) 2026 DFX AG. All rights reserved. Proprietary and confidential.

// Command proverd is a small HTTP prover backend used for development, CI and the
// SDK's Node end-to-end tests. It exposes Poseidon2 hashing and Groth16 proving.
//
// IMPORTANT: proverd computes proofs server-side and therefore sees the private
// witness. It is NOT a production path — on mobile, proving runs on-device via the
// native module (modules/cloister-prover). proverd exists so the SDK rewrite can be
// verified end-to-end without a device.
package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"

	"github.com/DFXswiss/cloister-protocol/prover-gnark/prover"
	"github.com/DFXswiss/cloister-protocol/prover-gnark/zk"
)

var pv *prover.Prover

func main() {
	keysDir := "./keys"
	// Bind localhost by default: proverd sees the private witness and must not be exposed
	// on the LAN. Pass an explicit host:port (e.g. 0.0.0.0:8799) to override deliberately.
	addr := "127.0.0.1:8799"
	if len(os.Args) > 1 {
		keysDir = os.Args[1]
	}
	if len(os.Args) > 2 {
		addr = os.Args[2]
	}

	p, err := prover.Load(keysDir)
	if err != nil {
		fmt.Fprintln(os.Stderr, "load keys:", err)
		os.Exit(1)
	}
	pv = p

	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"ok":true}`))
	})
	http.HandleFunc("/hash", handleHash)
	http.HandleFunc("/prove", handleProve)

	fmt.Println("cloister proverd listening on", addr, "(keys:", keysDir+")")
	if err := http.ListenAndServe(addr, nil); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func handleHash(w http.ResponseWriter, r *http.Request) {
	var items []string
	if err := json.NewDecoder(r.Body).Decode(&items); err != nil {
		httpErr(w, err)
		return
	}
	out, err := zk.HashDecimal(items)
	if err != nil {
		httpErr(w, err)
		return
	}
	writeJSON(w, map[string]string{"hash": out})
}

func handleProve(w http.ResponseWriter, r *http.Request) {
	var wi zk.WitnessInput
	if err := json.NewDecoder(r.Body).Decode(&wi); err != nil {
		httpErr(w, err)
		return
	}
	res, err := pv.ProveWitness(&wi) // self-verifies before returning
	if err != nil {
		httpErr(w, err)
		return
	}
	writeJSON(w, map[string]any{
		"proofHex":      "0x" + hexBytes(res.ProofBytes),
		"a":             res.A,
		"b":             res.B,
		"c":             res.C,
		"publicSignals": res.Public,
	})
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

func httpErr(w http.ResponseWriter, err error) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusBadRequest)
	_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
}

const hexdigits = "0123456789abcdef"

func hexBytes(b []byte) string {
	out := make([]byte, len(b)*2)
	for i, c := range b {
		out[i*2] = hexdigits[c>>4]
		out[i*2+1] = hexdigits[c&0x0f]
	}
	return string(out)
}
