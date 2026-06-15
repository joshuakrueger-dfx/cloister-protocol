// Copyright (c) 2026 DFX AG. Licensed under the MIT License (see LICENSE).

//go:build js && wasm

// Command wasm is the browser (WebAssembly) build of the Cloister gnark prover.
// It exposes the same surface as the gomobile binding (Init/Ready/Prove/Hash) on
// the JS global, so the web app proves fully client-side — MIT-clean, no snarkjs.
//
// Build:  GOOS=js GOARCH=wasm go build -o cloister.wasm ./cmd/wasm
// Load:   <script src="wasm_exec.js">; const go=new Go(); WebAssembly.instantiate(...)
package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"sync"
	"syscall/js"

	"github.com/DFXswiss/cloister-protocol/prover-gnark/prover"
	"github.com/DFXswiss/cloister-protocol/prover-gnark/zk"
)

var (
	mu sync.Mutex
	pv *prover.Prover
)

func main() {
	js.Global().Set("cloisterInit", js.FuncOf(initFn))
	js.Global().Set("cloisterReady", js.FuncOf(readyFn))
	js.Global().Set("cloisterProve", js.FuncOf(proveFn))
	js.Global().Set("cloisterHash", js.FuncOf(hashFn))
	js.Global().Get("console").Call("log", "cloister-wasm: prover loaded")
	select {} // keep the Go runtime alive for the exported callbacks
}

// cloisterInit(r1cs: Uint8Array, pk: Uint8Array, vk: Uint8Array) -> Promise<true>
func initFn(_ js.Value, args []js.Value) interface{} {
	if len(args) < 3 {
		return rejected(errors.New("init needs r1cs, pk, vk byte arrays"))
	}
	r1cs := toBytes(args[0])
	pk := toBytes(args[1])
	vk := toBytes(args[2])
	return promise(func() (interface{}, error) {
		p, err := prover.LoadFrom(bytes.NewReader(r1cs), bytes.NewReader(pk), bytes.NewReader(vk))
		if err != nil {
			return nil, err
		}
		mu.Lock()
		pv = p
		mu.Unlock()
		return true, nil
	})
}

// cloisterReady() -> bool
func readyFn(_ js.Value, _ []js.Value) interface{} {
	mu.Lock()
	defer mu.Unlock()
	return pv != nil
}

// cloisterProve(witnessInputJSON: string) -> Promise<resultJSON: string>
func proveFn(_ js.Value, args []js.Value) interface{} {
	if len(args) < 1 {
		return rejected(errors.New("prove needs a witness JSON string"))
	}
	witnessJSON := args[0].String()
	return promise(func() (interface{}, error) {
		mu.Lock()
		p := pv
		mu.Unlock()
		if p == nil {
			return nil, errors.New("prover not initialized — call cloisterInit first")
		}
		var wi zk.WitnessInput
		if err := json.Unmarshal([]byte(witnessJSON), &wi); err != nil {
			return nil, err
		}
		res, err := p.ProveWitness(&wi)
		if err != nil {
			return nil, err
		}
		out, err := json.Marshal(struct {
			A      [2]string    `json:"a"`
			B      [2][2]string `json:"b"`
			C      [2]string    `json:"c"`
			Public [10]string   `json:"publicSignals"`
		}{res.A, res.B, res.C, res.Public})
		if err != nil {
			return nil, err
		}
		return string(out), nil
	})
}

// cloisterHash(itemsJSON: string) -> string (Poseidon2, decimal). Fast → synchronous.
func hashFn(_ js.Value, args []js.Value) interface{} {
	if len(args) < 1 {
		return jsErr(errors.New("hash needs a JSON array of field elements"))
	}
	var items []string
	if err := json.Unmarshal([]byte(args[0].String()), &items); err != nil {
		return jsErr(err)
	}
	out, err := zk.HashDecimal(items)
	if err != nil {
		return jsErr(err)
	}
	return js.ValueOf(out)
}

// ---------- JS interop helpers ----------

func toBytes(v js.Value) []byte {
	n := v.Get("length").Int()
	b := make([]byte, n)
	js.CopyBytesToGo(b, v)
	return b
}

// promise wraps a Go function as a JS Promise; the work runs in a goroutine so the
// call returns immediately (proving is CPU-heavy — the caller awaits it).
func promise(fn func() (interface{}, error)) interface{} {
	handler := js.FuncOf(func(_ js.Value, pargs []js.Value) interface{} {
		resolve, reject := pargs[0], pargs[1]
		go func() {
			res, err := fn()
			if err != nil {
				reject.Invoke(js.Global().Get("Error").New(err.Error()))
				return
			}
			resolve.Invoke(js.ValueOf(res))
		}()
		return nil
	})
	return js.Global().Get("Promise").New(handler)
}

func rejected(err error) interface{} {
	return js.Global().Get("Promise").Call("reject", js.Global().Get("Error").New(err.Error()))
}

func jsErr(err error) interface{} {
	return js.Global().Get("Error").New(err.Error())
}
