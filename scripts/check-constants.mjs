// Copyright (c) 2026 DFX AG. Licensed under the MIT License (see LICENSE).
//
// Constants consistency gate. FIELD_SIZE (BN254 scalar field) and MERKLE_LEVELS (tree depth)
// are hand-written in Solidity, the gnark Go circuit and the JS SDK. If any copy drifts, the
// verifier, the circuit and the SDK silently disagree — a soundness bug that no unit test
// would catch. This script is the single source of truth (constants/protocol.json) plus an
// assertion that every language's copy matches it. Run in CI; exits non-zero on any mismatch.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const canonical = JSON.parse(readFileSync(resolve(root, "constants/protocol.json"), "utf8"));
const FIELD = canonical.FIELD_SIZE;
const LEVELS = String(canonical.MERKLE_LEVELS);

const read = (p) => readFileSync(resolve(root, p), "utf8");
const errors = [];
const check = (label, ok) => {
  if (!ok) errors.push(label);
};

// FIELD_SIZE — must appear verbatim wherever the field modulus is hard-coded.
const fieldFiles = [
  "packages/contracts/contracts/ShieldedPool.sol",
  "packages/sdk/src/constants.js",
  "packages/contracts/test/gen-transact-fixture.js",
  "packages/contracts/test/ShieldedPool.guards.test.js",
];
for (const f of fieldFiles) {
  check(`FIELD_SIZE missing/wrong in ${f}`, read(f).includes(FIELD));
}

// MERKLE_LEVELS — Solidity pins it (`levels == 20`), the SDK exports it, the Go circuit fixes it.
check(`MERKLE_LEVELS != ${LEVELS} in ShieldedPool.sol`, new RegExp(`levels == ${LEVELS}\\b`).test(read("packages/contracts/contracts/ShieldedPool.sol")));
check(`MERKLE_LEVELS != ${LEVELS} in sdk/constants.js`, new RegExp(`MERKLE_LEVELS\\s*=\\s*${LEVELS}\\b`).test(read("packages/sdk/src/constants.js")));
check(`Levels != ${LEVELS} in prover-gnark/zk/merkle.go`, new RegExp(`Levels\\s*=\\s*${LEVELS}\\b`).test(read("packages/prover-gnark/zk/merkle.go")));

if (errors.length) {
  console.error("constants drift detected (fix the file(s) to match constants/protocol.json):");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(`constants OK — FIELD_SIZE + MERKLE_LEVELS=${LEVELS} consistent across Solidity, Go and the SDK.`);
