# Setup manifest — verifying-key provenance

The proving key, verifying key, compiled circuit and the on-chain Solidity verifier MUST all
describe **one** trusted-setup run. This manifest pins the committed artifacts; the
`provenance` Go test (packages/prover-gnark/provenance/provenance_test.go) fails CI if
`Groth16Verifier.sol` ever drifts from `keys/vk.bin`.

| Artifact | SHA-256 |
|----------|---------|
| `packages/prover-gnark/keys/vk.bin` | `cf5d5db66387256d17a211ebc958710c4e87bde82718653964b8a9dc392ac5db` |
| `packages/contracts/contracts/Groth16Verifier.sol` | `6dd9b658cb66304bbbd8bc6cc972604558f8c0f9212c6a2222617512a88ab7e5` |

- `keys/pk.bin` and `keys/circuit.r1cs` are gitignored (large/derived) and are regenerated
  by `go run ./cmd/setup` only when absent; existing keys are reused so the triple stays fixed.
- **Deployed verifier (Base Sepolia, chainId 84532):** `0x9202d333794dC0e248B9DdA3c80dB6F5F204a6cd`
  (matches the committed vk.bin — see `deployment.basesepolia.json`).

## Trusted setup status

The keys above come from a **single-party** `groth16.Setup` (gnark) — acceptable for the
**testnet pilot** only. The party that ran setup holds the toxic waste and could forge proofs;
therefore mainnet is gated on a published multi-party Phase-2 MPC ceremony (see
`docs/en/concepts/MPC_CEREMONY.md`). Do NOT reuse these testnet keys for any real-value deployment.
