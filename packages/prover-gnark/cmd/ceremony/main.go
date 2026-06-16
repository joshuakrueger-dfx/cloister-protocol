// Copyright (c) 2026 DFX AG. Licensed under the MIT License (see LICENSE).

// Command ceremony is the operator CLI for a multi-party Groth16 Phase-2 trusted-setup ceremony
// for the Cloister circuit. Replaces the single-party cmd/setup for any value-bearing deployment:
// the resulting keys are secure as long as ≥1 contributor in each phase was honest.
//
// Typical run (transcript files passed between contributors' offline machines):
//
//	# coordinator
//	ceremony phase1-init               transcript/p1-0.bin
//	# contributor i (offline): reads p1-(i-1), writes p1-i, then DISCARDS the machine state
//	ceremony phase1-contribute         transcript/p1-0.bin transcript/p1-1.bin
//	ceremony phase1-contribute         transcript/p1-1.bin transcript/p1-2.bin
//	# coordinator: verify the chain + seal with a PUBLIC randomness beacon (e.g. a future BTC hash)
//	ceremony phase1-verify  <beacon>   transcript/commons.bin transcript/p1-1.bin transcript/p1-2.bin
//	ceremony phase2-init               transcript/commons.bin transcript/p2-0.bin
//	ceremony phase2-contribute         transcript/p2-0.bin transcript/p2-1.bin
//	ceremony phase2-contribute         transcript/p2-1.bin transcript/p2-2.bin
//	ceremony phase2-finalize <beacon>  transcript/commons.bin keys/ transcript/p2-1.bin transcript/p2-2.bin
//	# → keys/pk.bin, keys/vk.bin, keys/Groth16Verifier.sol  (deploy THIS verifier)
//
// Anyone can independently re-run phase1-verify + phase2-finalize over the published transcript to
// confirm the deployed verifier came from this ceremony.
package main

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/consensys/gnark/backend/groth16/bn254/mpcsetup"
	csbn254 "github.com/consensys/gnark/constraint/bn254"

	"github.com/DFXswiss/cloister-protocol/prover-gnark/ceremony"
)

func main() {
	if len(os.Args) < 2 {
		usage()
	}
	switch os.Args[1] {
	case "phase1-init":
		// phase1-init <out.bin>
		args := os.Args[2:]
		need(len(args) == 1, "phase1-init <out.bin>")
		r := compile()
		domain := ceremony.DomainSize(r)
		must(ceremony.WriteObj(args[0], ceremony.InitPhase1(domain)))
		fmt.Printf("phase1 base written → %s (domain 2^%d for %d constraints)\n", args[0], log2(domain), r.GetNbConstraints())

	case "phase1-contribute":
		// phase1-contribute <in.bin> <out.bin>
		args := os.Args[2:]
		need(len(args) == 2, "phase1-contribute <in.bin> <out.bin>")
		p := new(mpcsetup.Phase1)
		must(ceremony.ReadObj(args[0], p))
		ceremony.Contribute1(p)
		must(ceremony.WriteObj(args[1], p))
		fmt.Printf("phase1 contribution written → %s (now DISCARD this machine's memory/disk)\n", args[1])

	case "phase1-verify":
		// phase1-verify <beacon> <out-commons.bin> <c1.bin> [c2.bin ...]
		args := os.Args[2:]
		need(len(args) >= 3, "phase1-verify <beacon> <out-commons.bin> <c1.bin> [c2.bin ...]")
		beacon, out, files := args[0], args[1], args[2:]
		r := compile()
		contribs := make([]*mpcsetup.Phase1, len(files))
		for i, f := range files {
			contribs[i] = new(mpcsetup.Phase1)
			must(ceremony.ReadObj(f, contribs[i]))
		}
		commons, err := ceremony.VerifyPhase1(ceremony.DomainSize(r), []byte(beacon), contribs...)
		must(err)
		must(ceremony.WriteObj(out, &commons))
		fmt.Printf("phase1 VERIFIED (%d contributions) + sealed → %s\n", len(files), out)

	case "phase2-init":
		// phase2-init <commons.bin> <out.bin>
		args := os.Args[2:]
		need(len(args) == 2, "phase2-init <commons.bin> <out.bin>")
		r := compile()
		var commons mpcsetup.SrsCommons
		must(ceremony.ReadObj(args[0], &commons))
		p2, _ := ceremony.InitPhase2(r, &commons)
		must(ceremony.WriteObj(args[1], p2))
		fmt.Printf("phase2 base (circuit-specific) written → %s\n", args[1])

	case "phase2-contribute":
		// phase2-contribute <in.bin> <out.bin>
		args := os.Args[2:]
		need(len(args) == 2, "phase2-contribute <in.bin> <out.bin>")
		p := new(mpcsetup.Phase2)
		must(ceremony.ReadObj(args[0], p))
		ceremony.Contribute2(p)
		must(ceremony.WriteObj(args[1], p))
		fmt.Printf("phase2 contribution written → %s (now DISCARD this machine's memory/disk)\n", args[1])

	case "phase2-finalize":
		// phase2-finalize <beacon> <commons.bin> <keysDir> <c1.bin> [c2.bin ...]
		args := os.Args[2:]
		need(len(args) >= 4, "phase2-finalize <beacon> <commons.bin> <keysDir> <c1.bin> [c2.bin ...]")
		beacon, commonsPath, keysDir, files := args[0], args[1], args[2], args[3:]
		r := compile()
		var commons mpcsetup.SrsCommons
		must(ceremony.ReadObj(commonsPath, &commons))
		contribs := make([]*mpcsetup.Phase2, len(files))
		for i, f := range files {
			contribs[i] = new(mpcsetup.Phase2)
			must(ceremony.ReadObj(f, contribs[i]))
		}
		pk, vk, err := ceremony.FinalizePhase2(r, &commons, []byte(beacon), contribs...)
		must(err)
		must(os.MkdirAll(keysDir, 0o755))
		must(ceremony.WriteObj(filepath.Join(keysDir, "pk.bin"), pk))
		must(ceremony.WriteObj(filepath.Join(keysDir, "vk.bin"), vk))
		// also persist the compiled R1CS so the prover can load it (matches cmd/setup layout)
		must(ceremony.WriteObj(filepath.Join(keysDir, "circuit.r1cs"), r))
		solF, err := os.Create(filepath.Join(keysDir, "Groth16Verifier.sol"))
		must(err)
		defer solF.Close()
		must(vk.ExportSolidity(solF))
		fmt.Printf("phase2 VERIFIED (%d contributions) + sealed.\n", len(files))
		fmt.Printf("wrote %s/{pk.bin,vk.bin,circuit.r1cs,Groth16Verifier.sol}\n", keysDir)
		fmt.Println("→ deploy Groth16Verifier.sol; publish the full transcript so anyone can re-verify.")

	default:
		usage()
	}
}

func compile() *csbn254.R1CS {
	r, err := ceremony.CompileCircuit()
	must(err)
	return r
}

func usage() {
	fmt.Fprintln(os.Stderr, "usage: ceremony <phase1-init|phase1-contribute|phase1-verify|phase2-init|phase2-contribute|phase2-finalize> ...")
	fmt.Fprintln(os.Stderr, "see the package doc comment for the full ceremony flow.")
	os.Exit(2)
}

func need(ok bool, usageLine string) {
	if !ok {
		fmt.Fprintln(os.Stderr, "usage: ceremony "+usageLine)
		os.Exit(2)
	}
}

func must(err error) {
	if err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

func log2(n uint64) int {
	b := 0
	for n > 1 {
		n >>= 1
		b++
	}
	return b
}
