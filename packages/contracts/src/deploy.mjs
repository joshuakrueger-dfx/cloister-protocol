import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { Contract, ContractFactory, ZeroAddress } from "ethers";
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
  { levels = 20, numLanes = 8, asp = ZeroAddress, initialAspRoot, token: tokenAddress, guardian } = {},
) {
  // Base mainnet guardrails: no permissive (ASP-less) dev mode and no MockERC20 — a real
  // ASP + the canonical USDC address are mandatory. Sepolia/local keep the dev defaults.
  const chainId = Number((await signer.provider.getNetwork()).chainId);
  if (chainId === 8453) {
    if (asp === ZeroAddress) throw new Error("mainnet deploy: a non-zero ASP is required (no permissive dev mode)");
    if (!tokenAddress) throw new Error("mainnet deploy: a real token address (canonical USDC) is required; refusing MockERC20");
  }

  const initialRoot = (await (await new MerkleTree(levels).init()).root()).toString();
  const aspRoot = initialAspRoot != null ? String(initialAspRoot) : initialRoot;

  const verifier = await deploy("TransactionVerifier", "TransactionVerifier", signer);
  // Reuse an existing token (canonical USDC on mainnet) or deploy a MockERC20 for dev/test.
  const token = tokenAddress
    ? new Contract(tokenAddress, loadAbi("MockERC20", "MockERC20"), signer)
    : await deploy("MockERC20", "MockERC20", signer, ["USD Coin", "USDC", 6]);
  const pool = await deploy("ShieldedPool", "ShieldedPool", signer, [
    levels,
    numLanes,
    initialRoot,
    await verifier.getAddress(),
    await token.getAddress(),
    guardian ?? (await signer.getAddress()), // guardian (mainnet: pass a multisig)
    asp, // ASP-Rolle (ZeroAddress = permissiv, auf Mainnet verboten)
    asp === ZeroAddress ? 0n : aspRoot, // initiale Good-Set-Root nur bei aktivem ASP
  ]);
  const registry = await deploy("PoolRegistry", "PoolRegistry", signer);

  return { verifier, token, pool, registry, initialRoot, numLanes, asp, initialAspRoot: aspRoot };
}
