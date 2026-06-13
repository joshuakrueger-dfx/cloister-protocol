import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { ContractFactory, ZeroAddress } from "ethers";
import { MerkleTree } from "@cloister/sdk";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ARTIFACTS = resolve(__dirname, "..", "artifacts", "contracts");

function artifact(file, name) {
  const json = JSON.parse(readFileSync(resolve(ARTIFACTS, `${file}.sol`, `${name}.json`), "utf8"));
  return { abi: json.abi, bytecode: json.bytecode };
}

export function loadAbi(file, name) {
  return artifact(file, name).abi;
}

async function deploy(name, file, signer, args = []) {
  const { abi, bytecode } = artifact(file, name);
  const factory = new ContractFactory(abi, bytecode, signer);
  const c = await factory.deploy(...args);
  await c.waitForDeployment();
  return c;
}

// Deployt den kompletten Stack. Off-chain-Insertion: kein Poseidon-Hasher-Contract mehr;
// der Pool bekommt die initiale (leere) Root übergeben.
// asp: Adresse des Association-Set-Providers. ZeroAddress = permissiver Dev-Modus
//   (keine ASP-Erzwingung — für die PoC-Demos). Die App/Provider deployt mit asp = Betreiber.
// initialAspRoot: erste Good-Set-Root (Default = leere Tree-Root, sodass der erste
//   Deposit-Proof gegen sie verifiziert). 0 = keine initiale Root registrieren.
export async function deployAll(
  signer,
  { levels = 20, numLanes = 8, asp = ZeroAddress, initialAspRoot } = {},
) {
  const initialRoot = (await (await new MerkleTree(levels).init()).root()).toString();
  const aspRoot = initialAspRoot != null ? String(initialAspRoot) : initialRoot;

  const verifier = await deploy("TransactionVerifier", "TransactionVerifier", signer);
  const token = await deploy("MockERC20", "MockERC20", signer, ["USD Coin", "USDC", 6]);
  const pool = await deploy("ShieldedPool", "ShieldedPool", signer, [
    levels,
    numLanes,
    initialRoot,
    await verifier.getAddress(),
    await token.getAddress(),
    await signer.getAddress(), // guardian (kann nur Einzahlungen pausieren)
    asp, // ASP-Rolle (ZeroAddress = permissiv)
    asp === ZeroAddress ? 0n : aspRoot, // initiale Good-Set-Root nur bei aktivem ASP
  ]);
  const registry = await deploy("PoolRegistry", "PoolRegistry", signer);

  return { verifier, token, pool, registry, initialRoot, numLanes, asp, initialAspRoot: aspRoot };
}
