#!/usr/bin/env node
// Kompiliert die Circuits, besorgt eine passende Powers-of-Tau-Datei, fährt den
// Groth16-Setup (lokal, PoC — NICHT produktionssicher) und exportiert Verifier +
// Verification-Key + WASM-Prover.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgDir = resolve(__dirname, "..");
const repoRoot = resolve(pkgDir, "..", "..");

const CIRCOM = resolve(repoRoot, "bin", "circom");
const SNARKJS = resolve(pkgDir, "node_modules", ".bin", "snarkjs");
const SRC = resolve(pkgDir, "circuits");
const BUILD = resolve(pkgDir, "build");
const PTAU_DIR = resolve(BUILD, "ptau");

const CIRCUIT = process.env.CIRCUIT || "transaction2";

mkdirSync(BUILD, { recursive: true });
mkdirSync(PTAU_DIR, { recursive: true });

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { stdio: "inherit", cwd: pkgDir, ...opts });

console.log(`\n[1/5] circom compile ${CIRCUIT}.circom`);
run(CIRCOM, [
  resolve(SRC, `${CIRCUIT}.circom`),
  "--r1cs", "--wasm", "--sym",
  "-l", "node_modules",
  "-o", BUILD,
]);

console.log("\n[2/5] r1cs info");
const info = execFileSync(SNARKJS, ["r1cs", "info", resolve(BUILD, `${CIRCUIT}.r1cs`)], {
  cwd: pkgDir,
}).toString();
process.stdout.write(info);
const m = info.match(/# of Constraints:\s*(\d+)/i);
const constraints = m ? parseInt(m[1], 10) : 0;
let power = Math.max(12, Math.ceil(Math.log2(constraints)) + 1);
power = Math.min(power, 28);
console.log(`constraints=${constraints} → ptau power=${power}`);

const ptau = resolve(PTAU_DIR, `pot${power}_final.ptau`);
if (!existsSync(ptau)) {
  const url = `https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_${String(power).padStart(2, "0")}.ptau`;
  console.log(`\n[3/5] download ptau: ${url}`);
  try {
    run("curl", ["-fSL", "-o", ptau, url]);
  } catch (e) {
    console.log("download failed → generating ptau locally (slower)…");
    const t0 = resolve(PTAU_DIR, `pot${power}_0000.ptau`);
    const t1 = resolve(PTAU_DIR, `pot${power}_0001.ptau`);
    run(SNARKJS, ["powersoftau", "new", "bn128", String(power), t0, "-v"]);
    run(SNARKJS, ["powersoftau", "contribute", t0, t1, "--name=ocp-shield", "-e=ocp-shield-poc-entropy"]);
    run(SNARKJS, ["powersoftau", "prepare", "phase2", t1, ptau, "-v"]);
  }
} else {
  console.log(`\n[3/5] ptau cached: ${ptau}`);
}

console.log("\n[4/5] groth16 setup + contribute");
const zkey0 = resolve(BUILD, `${CIRCUIT}_0000.zkey`);
const zkeyFinal = resolve(BUILD, `${CIRCUIT}_final.zkey`);
run(SNARKJS, ["groth16", "setup", resolve(BUILD, `${CIRCUIT}.r1cs`), ptau, zkey0]);
run(SNARKJS, ["zkey", "contribute", zkey0, zkeyFinal, "--name=ocp-shield-poc", "-e=ocp-shield-poc-contribution"]);

console.log("\n[5/5] export verification key + solidity verifier");
run(SNARKJS, ["zkey", "export", "verificationkey", zkeyFinal, resolve(BUILD, "verification_key.json")]);
const verifierSol = resolve(BUILD, "Verifier.sol");
run(SNARKJS, ["zkey", "export", "solidityverifier", zkeyFinal, verifierSol]);

// Verifier in das contracts-Paket spiegeln (falls vorhanden)
const contractsDir = resolve(repoRoot, "packages", "contracts", "contracts");
if (existsSync(contractsDir)) {
  let sol = readFileSync(verifierSol, "utf8").replace(/contract Groth16Verifier/, "contract TransactionVerifier");
  writeFileSync(resolve(contractsDir, "TransactionVerifier.sol"), sol);
  console.log("→ copied verifier to packages/contracts/contracts/TransactionVerifier.sol");
}

console.log(`\n✅ circuit '${CIRCUIT}' built (${constraints} constraints). Artifacts in ${BUILD}`);
