#!/usr/bin/env bash
# Copyright (c) 2026 DFX AG. Licensed under the MIT License (see LICENSE).
#
# Periodic (manual) mutation-testing gate for the circuit + crypto primitives.
#
# WHY MANUAL, NOT CI: source-level mutation testing recompiles + re-runs the suite once per
# mutant — minutes-to-tens-of-minutes for a 50k-constraint circuit, and the tool is sensitive
# to the Go toolchain version. The CI-resident equivalent is the in-test UNDER-CONSTRAINED HUNT
# (zk/property_test.go: TestTxCircuitNoUnderConstrainedSignals), which mutates every witness
# signal and proves each is constrained. Run THIS script before a release / audit handoff as the
# stronger, source-level check: it mutates the circuit/crypto SOURCE and a surviving mutant means
# the test suite failed to catch a real code change = a coverage hole to close.
#
# Usage:  scripts/mutation-test.sh [package]   (default: ./prover-gnark/zk)
set -euo pipefail

PKG="${1:-./zk}"
cd "$(dirname "$0")/../packages/prover-gnark"

if ! command -v go-mutesting >/dev/null 2>&1; then
  echo "go-mutesting not found. Install it for the release/audit mutation gate:"
  echo "  go install github.com/avito-tech/go-mutesting/cmd/go-mutesting@latest"
  echo "(skipped — this is a periodic manual gate, not a CI dependency.)"
  exit 0
fi

echo "Mutation testing $PKG — surviving mutants = test coverage holes to close."
go-mutesting "$PKG" --exec "go test -timeout 600s ./..." | tee /tmp/cloister-mutation.log
echo
echo "Review the score above. For a value-bearing circuit, target a HIGH score on the"
echo "constraint logic (value conservation, nullifier/commitment binding, Merkle membership)."
echo "Any surviving mutant in those areas is a soundness-coverage gap — add a test that kills it."
