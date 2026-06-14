# Cloister — Deployment runbook

The full stack deploys with one command. The script (`apps/demo/src/deploy-testnet.mjs`)
is verified end-to-end against a local hardhat chain, so a real network is only a config
change.

## Prerequisites

1. Build the keys + verifier (once):
   ```bash
   cd packages/prover-gnark && go run ./cmd/setup .
   # copy build/Verifier.sol → packages/contracts/contracts/Groth16Verifier.sol (rename contract → Groth16Verifier)
   cd ../contracts && npx hardhat compile
   ```
2. Run a Poseidon2 backend (used to compute the empty-tree root at deploy time):
   ```bash
   cd packages/prover-gnark && go run ./cmd/proverd ./keys :8799
   ```

## Deploy

```bash
cd apps/demo
RPC=<https-rpc> \
DEPLOYER_KEY=<funded-deployer-private-key> \
PROVERD_URL=http://127.0.0.1:8799 \
ASSET=USDC \
ASP=0x0000000000000000000000000000000000000000 \
node src/deploy-testnet.mjs
```

This deploys `TransactionVerifier`, the token, `ShieldedPool` (with the Poseidon2
empty-tree `initialRoot`) and `PoolRegistry`, **registers the pool** in the registry, and
writes `deployment.<chainId>.json`.

> Env vars also accepted: `BASE_SEPOLIA_RPC`, `BASE_SEPOLIA_DEPLOYER_KEY`. A repo-root
> `.env.testnet` (git-ignored) is read as a fallback.

### Local dry-run (proves the script before spending real gas)

```bash
cd packages/contracts && npx hardhat node &          # chainId 31337
cd packages/prover-gnark && go run ./cmd/proverd ./keys :8799 &
cd apps/demo
RPC=http://127.0.0.1:8545 \
DEPLOYER_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
node src/deploy-testnet.mjs                            # ✅ deploys + registers locally
```

## Mainnet checklist (hard requirements before real value)

1. **Replace the trusted setup** with a multi-party Phase-2 ceremony; re-export the
   verifier from the ceremony `vk`.
2. Deploy against the **real asset token** (not `MockERC20`).
3. Set `guardian`, `asp`, and the `PoolRegistry` owner to a **multisig + timelock**.
4. Publish the first ASP good-set root (`publishAspRoot`) if running in compliance mode
   (`ASP != 0`).
5. Independent external **audit** of contracts + circuit.
6. Point the wallet/SDK config at the new `pool` / `verifier` / `registry` addresses.

## What changes for a real network vs. local

Only `RPC`, `DEPLOYER_KEY`, and (optionally) `ASSET`/`ASP`. The contracts, circuit, keys,
and verifier are identical to what the 1000-tx soak + adversarial battery exercised.
