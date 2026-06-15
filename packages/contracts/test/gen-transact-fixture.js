// Generates a real deposit proof fixture for ShieldedPool.transact.e2e.test.js.
// Run once: `node test/gen-transact-fixture.js` (re-run if the circuit/scheme changes).
const { AbiCoder, keccak256, ZeroAddress } = require("ethers");
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const FIELD_SIZE =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const EXT_DATA_ABI =
  "tuple(address recipient,int256 extAmount,address relayer,uint256 fee,bytes encryptedOutput1,bytes encryptedOutput2)";

const AMOUNT = 1_000_000n; // 1 USDC (6 decimals)
const extData = {
  recipient: ZeroAddress,
  extAmount: AMOUNT.toString(),
  relayer: ZeroAddress,
  fee: "0",
  encryptedOutput1: "0x",
  encryptedOutput2: "0x",
};

const coder = AbiCoder.defaultAbiCoder();
const encoded = coder.encode(
  [EXT_DATA_ABI],
  [[extData.recipient, extData.extAmount, extData.relayer, extData.fee, extData.encryptedOutput1, extData.encryptedOutput2]],
);
const extDataHash = (BigInt(keccak256(encoded)) % FIELD_SIZE).toString();

const proverDir = path.join(__dirname, "..", "..", "prover-gnark");
const scenarioPath = path.join(__dirname, "testdata", "scenario.json");
const outPath = path.join(__dirname, "testdata", "transact.json");
fs.mkdirSync(path.dirname(scenarioPath), { recursive: true });
// The committed testdata/transact.json is the source of truth — it matches the committed
// Groth16Verifier.sol. Regenerating needs the prover keys (./keys, absent in CI), so only
// regenerate when explicitly asked (REGEN_FIXTURE=1) or when the fixture is missing.
if (process.env.REGEN_FIXTURE === "1" || !fs.existsSync(outPath)) {
  fs.writeFileSync(scenarioPath, JSON.stringify({ amount: AMOUNT.toString(), extDataHash }, null, 2));
  console.log("scenario:", { amount: AMOUNT.toString(), extDataHash });
  execFileSync("go", ["run", "./cmd/emitscenario", "./keys", scenarioPath, outPath], {
    cwd: proverDir,
    stdio: "inherit",
  });
  // stash the extData alongside the proof so the test can reconstruct it verbatim
  const fixture = JSON.parse(fs.readFileSync(outPath, "utf8"));
  fixture.extData = extData;
  fixture.amount = AMOUNT.toString();
  fs.writeFileSync(outPath, JSON.stringify(fixture, null, 2));
  console.log("wrote", outPath);
} else {
  console.log("using committed fixture", outPath);
}
