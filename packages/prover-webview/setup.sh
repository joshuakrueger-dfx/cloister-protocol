#!/usr/bin/env bash
# Kopiert die (gitignorierten) großen Artefakte in dieses Paket. Vorher: pnpm build:circuits.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$HERE/../.."
SNARKJS="$(find "$ROOT/node_modules/.pnpm" -name snarkjs.min.js -path '*build*' | head -1)"

cp "$SNARKJS" "$HERE/snarkjs.min.js"
cp "$ROOT/packages/circuits/build/transaction2_js/transaction2.wasm" "$HERE/fixtures/"
cp "$ROOT/packages/circuits/build/transaction2_final.zkey" "$HERE/fixtures/"
cp "$ROOT/packages/circuits/build/verification_key.json" "$HERE/fixtures/"
echo "✅ prover-webview artifacts copied (snarkjs + wasm + zkey + vkey)"
