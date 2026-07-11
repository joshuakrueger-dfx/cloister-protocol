# Redeploy the testnet stack (after the WP-A1 domain update)

The WP-A1 `extDataHash` domain-separation change modified `ShieldedPool.sol`; the circuit and
verifying key are unchanged, but **the currently-deployed Base Sepolia pool is stale** — the deployed
verifier `0x9202d333794dC0e248B9DdA3c80dB6F5F204a6cd` no longer matches the committed one, and the
pool bytecode changed. This runbook redeploys the stack so on-chain state matches the repo again.

Nothing in the repo needs a code change to "change the verifier": `TransactionVerifier` keeps the
same verifier. Recompile + redeploy the pool so its address-bound hash formula is live.

> Single-party testnet keys only. Mainnet remains gated on the multi-party MPC ceremony
> (`docs/en/concepts/MPC_CEREMONY.md`) — this runbook is for the Base Sepolia pilot.

## Prerequisites

- A funded Base Sepolia deployer key and an RPC endpoint.
- Go ≥ 1.21 (for `proverd`, which computes the Poseidon2 empty-tree root the deploy needs).
- Node ≥ 20 + pnpm.

## Steps

```bash
# 1) Proving keys + proverd (Poseidon2 backend). cmd/setup reuses the committed keys if present.
cd packages/prover-gnark
go run ./cmd/setup .
go build -o /tmp/proverd ./cmd/proverd && /tmp/proverd ./keys 127.0.0.1:8799 &

# 2) Compile the contracts — produces artifacts for the updated pool hash formula.
cd ../..
pnpm --filter @cloister/contracts compile

# 3) Deploy verifier + token + pool + registry; writes deployment.<chainId>.json and
#    registers the pool in the PoolRegistry.
RPC=https://base-sepolia-rpc.publicnode.com \
DEPLOYER_KEY=0x<your_funded_key> \
PROVERD_URL=http://127.0.0.1:8799 \
node apps/demo/src/deploy-testnet.mjs
```

`deploy-testnet.mjs` writes `deployment.84532.json` with the new addresses and registers the pool.

## After the deploy — reconcile the descriptors + manifest

The repo currently carries two descriptor names for the same chain; consolidate onto the
chainId-named one the deploy script writes and the relayers read:

- **Canonical:** `deployment.84532.json` (written by the deploy; read by `packages/api`'s
  `deposit-relayer.mjs` and `prepare-server.mjs`).
- **Legacy duplicate:** `deployment.basesepolia.json` (read only by the demo scripts
  `apps/demo/src/pay-testnet.mjs` and `preshield-testnet.mjs`). Point those two scripts at
  `deployment.84532.json` and delete `deployment.basesepolia.json`, so there is a single source of
  truth for the deployed addresses.
- Update `packages/prover-gnark/keys/SETUP_MANIFEST.md` "Deployed verifier" line with the new
  verifier address.
- Restart the relayer / prepare-server so they load the fresh `deployment.84532.json`.

## Verify

- `deployment.84532.json` verifier/pool addresses are the freshly-deployed ones.
- A deposit through the relayer lands (the domain-bound `extDataHash` — chainId 84532 + lane 0 —
  now matches the redeployed pool's recompute).
- `packages/prover-gnark/provenance` gate stays green (committed `Groth16Verifier.sol` ==
  `keys/vk.bin`; unaffected by the deploy, but confirms the triple you deployed from).
