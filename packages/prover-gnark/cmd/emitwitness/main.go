// Copyright (c) 2026 DFX AG. Licensed under the MIT License (see LICENSE).

// Command emitwitness prints the SDK wire witness (buildWitness format) for the
// canonical internal-pay sample, so the browser WASM prover can be tested against a
// known-good witness without the full SDK in the page.
package main

import (
	"encoding/json"
	"fmt"

	"github.com/DFXswiss/cloister-protocol/prover-gnark/zk"
)

func main() {
	spec := zk.SampleInternalPaySpec()
	asg := zk.BuildAssignment(spec)
	wi := zk.ToWitnessInput(asg)
	b, err := json.MarshalIndent(wi, "", "  ")
	if err != nil {
		panic(err)
	}
	fmt.Println(string(b))
}
