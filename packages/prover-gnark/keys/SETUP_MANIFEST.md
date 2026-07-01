# Setup manifest — verifying-key provenance

The proving key, verifying key, compiled circuit and the on-chain Solidity verifier MUST all
describe **one** trusted-setup run. This manifest pins the committed artifacts; the
`provenance` Go test (packages/prover-gnark/provenance/provenance_test.go) fails CI if
`Groth16Verifier.sol` ever drifts from `keys/vk.bin`.

| Artifact | SHA-256 |
|----------|---------|
| `packages/prover-gnark/keys/vk.bin` | `2022a9f4734336acedb97eb129e7d368f8ff382de6d239e5ff3a183cd4ce1c4b` |
| `packages/contracts/contracts/Groth16Verifier.sol` | `60c3f5f68ff34b1805d16abf72eac8beb5094ea86685d160d5ebf70b9f530e67` |

- `keys/pk.bin` and `keys/circuit.r1cs` are gitignored (large/derived) and are regenerated
  by `go run ./cmd/setup` only when absent; existing keys are reused so the triple stays fixed.
- **Re-keyed 2026-07-01** alongside the WP-A1 `extDataHash` domain-separation change. That change
  modifies `ShieldedPool.sol` itself, so the on-chain testnet contracts must be redeployed
  regardless; the key triple (`vk.bin` / `Groth16Verifier.sol` / regenerated real-proof fixture
  `packages/contracts/test/testdata/transact.json`) was regenerated together so it stays internally
  consistent (provenance gate + Hardhat E2E green). Still a **single-party** setup — testnet only.
- **Deployed verifier (Base Sepolia, chainId 84532):** the previously-deployed
  `0x9202d333794dC0e248B9DdA3c80dB6F5F204a6cd` no longer matches this vk.bin. **Redeploy the
  verifier + pool** and update `deployment.basesepolia.json` / `deployment.84532.json` before the
  testnet is used again (already required by the WP-A1 contract change).

## Trusted setup status

The keys above come from a **single-party** `groth16.Setup` (gnark) — acceptable for the
**testnet pilot** only. The party that ran setup holds the toxic waste and could forge proofs;
therefore mainnet is gated on a published multi-party Phase-2 MPC ceremony (see
`docs/en/concepts/MPC_CEREMONY.md`). Do NOT reuse these testnet keys for any real-value deployment.
