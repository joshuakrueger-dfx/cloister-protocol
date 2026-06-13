#!/usr/bin/env bash
# Fährt den kompletten lokalen Cloister-Stack für 100% E2E hoch:
#   Hardhat-Devnet → Provider/Relayer/ASP (ASP_ENFORCE) → Indexer → Web-App.
# Ein Ctrl-C beendet alles. Logs unter /tmp/cloister-*.log.
set -euo pipefail
cd "$(dirname "$0")/.."

LOGDIR="${TMPDIR:-/tmp}"
PIDS=()
cleanup() {
  echo ""
  echo "→ stopping stack…"
  for pid in "${PIDS[@]:-}"; do kill "$pid" 2>/dev/null || true; done
  for p in 8545 8788 8789 8799; do lsof -ti:$p 2>/dev/null | xargs kill -9 2>/dev/null || true; done
  exit 0
}
trap cleanup INT TERM

wait_port() { # $1 = port, $2 = name
  for _ in $(seq 1 60); do
    if lsof -ti:"$1" >/dev/null 2>&1; then echo "  ✓ $2 (:$1)"; return 0; fi
    sleep 0.5
  done
  echo "  ✗ $2 (:$1) did not come up — see ${LOGDIR}/cloister-*.log"; return 1
}

# clean stale
for p in 8545 8788 8789 8799; do lsof -ti:$p 2>/dev/null | xargs kill -9 2>/dev/null || true; done

echo "→ [1/5] Hardhat devnet"
pnpm node >"${LOGDIR}/cloister-node.log" 2>&1 & PIDS+=($!)
wait_port 8545 "devnet"

echo "→ [2/5] gnark proverd (Poseidon2 + Groth16, Node/dev backend)"
( cd packages/prover-gnark && go run ./cmd/proverd ./keys :8799 ) >"${LOGDIR}/cloister-proverd.log" 2>&1 & PIDS+=($!)
wait_port 8799 "proverd"

echo "→ [3/5] Provider + Relayer + ASP (ASP_ENFORCE=1)"
ASP_ENFORCE=1 pnpm api >"${LOGDIR}/cloister-api.log" 2>&1 & PIDS+=($!)
wait_port 8788 "provider/relayer"

echo "→ [4/5] Indexer (view-tags)"
pnpm indexer >"${LOGDIR}/cloister-indexer.log" 2>&1 & PIDS+=($!)
wait_port 8789 "indexer"

echo "→ [5/5] Web app"
pnpm --filter @cloister/web dev >"${LOGDIR}/cloister-web.log" 2>&1 & PIDS+=($!)
wait_port 5180 "web"

echo ""
echo "✅ Cloister stack up — open http://localhost:5180  (backend: Local)"
echo "   logs: ${LOGDIR}/cloister-{node,api,indexer,web}.log"
echo "   Ctrl-C to stop everything."
wait
