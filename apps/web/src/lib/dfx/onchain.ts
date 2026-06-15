// On-chain USDC balance lookup for the onramp→shield handoff. After a DFX buy
// settles, the USDC lands at the connected EVM address on the target chain;
// we poll its balance so the UI can offer "shield it" the moment it arrives.
// ethers is imported dynamically so it stays out of the main bundle.

import type { ChainId } from "../types";

// Native USDC (6 decimals) + a public RPC per supported chain.
const USDC: Record<ChainId, { token: string; rpc: string }> = {
  base: { token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", rpc: "https://mainnet.base.org" },
  polygon: { token: "0x3c499c542cEF5E3811e1192ce70d8cc03d5c3359", rpc: "https://polygon-rpc.com" },
  arbitrum: { token: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", rpc: "https://arb1.arbitrum.io/rpc" },
};

const ERC20_ABI = ["function balanceOf(address) view returns (uint256)"];

/** USDC balance (whole units) of `address` on `chain`. Returns 0 on any RPC
 *  error so a flaky endpoint never breaks the poll loop. */
export async function usdcBalance(address: string, chain: ChainId): Promise<number> {
  if (!address || !address.startsWith("0x")) return 0;
  try {
    const { JsonRpcProvider, Contract } = await import("ethers");
    const cfg = USDC[chain];
    const provider = new JsonRpcProvider(cfg.rpc);
    const erc20 = new Contract(cfg.token, ERC20_ABI, provider);
    const raw: bigint = await erc20.balanceOf(address);
    return Number(raw) / 1e6;
  } catch {
    return 0;
  }
}
