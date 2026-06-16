// Copyright (c) 2026 DFX AG. Licensed under the MIT License (see LICENSE).

// Package provenance gates the consistency of the verifying-key triple: the committed
// proving/verifying keys (keys/vk.bin), the compiled circuit, and the on-chain Solidity
// verifier (packages/contracts/contracts/Groth16Verifier.sol) MUST all describe the same
// setup. A stray `cmd/setup` run or a circuit change that re-exports the verifier without
// updating the deployed contract would silently desynchronize prover and verifier (proofs
// revert, or — worse — the chain verifies a different constraint set). This test makes that
// drift a hard CI failure: it re-derives the Solidity verifier from the committed vk.bin and
// asserts its verifying-key constants are byte-identical to the committed verifier contract.
package provenance

import (
	"os"
	"regexp"
	"sort"
	"strings"
	"testing"

	"github.com/consensys/gnark-crypto/ecc"
	"github.com/consensys/gnark/backend/groth16"
)

const (
	vkPath       = "../keys/vk.bin"
	verifierPath = "../../contracts/contracts/Groth16Verifier.sol"
)

// constLine captures the load-bearing verifying-key constants of the gnark Solidity export
// (alpha/beta/gamma/delta points + the per-public-input PUB_i points + CONSTANT_*). Whitespace,
// SPDX header, pragma and helper code are intentionally ignored — only the VK material must match.
var constLine = regexp.MustCompile(`uint256\s+constant\s+([A-Z0-9_]+)\s*=\s*(\d+)\s*;`)

func vkConstants(t *testing.T, solidity string) map[string]string {
	t.Helper()
	out := map[string]string{}
	for _, m := range constLine.FindAllStringSubmatch(solidity, -1) {
		out[m[1]] = m[2]
	}
	if len(out) == 0 {
		t.Fatalf("no verifying-key constants found")
	}
	return out
}

func TestDeployedVerifierMatchesCommittedKeys(t *testing.T) {
	// Re-derive the Solidity verifier from the committed verifying key.
	f, err := os.Open(vkPath)
	if err != nil {
		t.Fatalf("open %s: %v (commit keys/vk.bin so the provenance gate can run)", vkPath, err)
	}
	defer f.Close()
	vk := groth16.NewVerifyingKey(ecc.BN254)
	if _, err := vk.ReadFrom(f); err != nil {
		t.Fatalf("read vk: %v", err)
	}
	var exported strings.Builder
	if err := vk.ExportSolidity(&exported); err != nil {
		t.Fatalf("export solidity: %v", err)
	}

	committedBytes, err := os.ReadFile(verifierPath)
	if err != nil {
		t.Fatalf("read %s: %v", verifierPath, err)
	}

	want := vkConstants(t, exported.String())
	got := vkConstants(t, string(committedBytes))

	if len(want) != len(got) {
		t.Fatalf("constant count mismatch: vk.bin export has %d, committed verifier has %d", len(want), len(got))
	}
	var mismatches []string
	for name, wantVal := range want {
		if gotVal, ok := got[name]; !ok {
			mismatches = append(mismatches, name+": missing in committed verifier")
		} else if gotVal != wantVal {
			mismatches = append(mismatches, name+": vk.bin="+wantVal+" committed="+gotVal)
		}
	}
	sort.Strings(mismatches)
	if len(mismatches) > 0 {
		t.Fatalf("Groth16Verifier.sol has DRIFTED from keys/vk.bin (regenerate the verifier "+
			"from the committed vk, do NOT hand-edit):\n  %s", strings.Join(mismatches, "\n  "))
	}
}
