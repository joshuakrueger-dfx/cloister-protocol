#!/usr/bin/env bash
# Copyright (c) 2026 DFX AG. All rights reserved.
#
# Builds the on-device prover artifacts and installs them into the dfx-wallet
# Expo module (modules/cloister-prover). Reproducible pipeline:
#   1. groth16 setup → keys/{pk,vk}.bin + circuit.r1cs + Solidity verifier
#   2. gomobile bind → Cloister.xcframework (device + simulator)
#   3. copy framework + keys into the wallet module
#
# Usage: ./scripts/build-ios.sh [path-to-dfx-wallet]
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
WALLET="${1:-$HOME/DFXswiss/dfx-wallet}"
MODULE="$WALLET/modules/cloister-prover/ios"

export PATH="$PATH:$(go env GOPATH)/bin"

echo "==> 1/3 groth16 setup (keys + verifier)"
cd "$HERE"
go run ./cmd/setup .

echo "==> 2/3 gomobile bind (iOS xcframework)"
command -v gomobile >/dev/null || go install golang.org/x/mobile/cmd/gomobile@latest
gomobile init
rm -rf build/Cloister.xcframework
gomobile bind -target=ios -o build/Cloister.xcframework ./mobile

echo "==> 3/3 install into wallet module: $MODULE"
mkdir -p "$MODULE/keys"
rm -rf "$MODULE/Cloister.xcframework"
cp -R build/Cloister.xcframework "$MODULE/"
cp keys/pk.bin keys/vk.bin keys/circuit.r1cs "$MODULE/keys/"

echo "==> done. Re-run 'npx expo prebuild --clean' + pod install in the wallet."
