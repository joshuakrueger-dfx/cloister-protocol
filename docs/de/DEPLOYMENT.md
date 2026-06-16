# Cloister — Deployment-Runbook

Der gesamte Stack wird mit einem einzigen Befehl deployt. Das Skript (`apps/demo/src/deploy-testnet.mjs`)
ist Ende-zu-Ende gegen eine lokale Hardhat-Chain verifiziert, sodass ein echtes Netzwerk lediglich eine
Konfigurationsänderung ist.

## Voraussetzungen

1. Bauen Sie die Keys + den Verifier (einmalig):
   ```bash
   cd packages/prover-gnark && go run ./cmd/setup .
   # copy build/Verifier.sol → packages/contracts/contracts/Groth16Verifier.sol (rename contract → Groth16Verifier)
   cd ../contracts && npx hardhat compile
   ```
2. Betreiben Sie ein Poseidon2-Backend (wird zur Berechnung des Leerbaum-Roots beim Deployment genutzt):
   ```bash
   cd packages/prover-gnark && go run ./cmd/proverd ./keys :8799
   ```

## Deployment

```bash
cd apps/demo
RPC=<https-rpc> \
DEPLOYER_KEY=<funded-deployer-private-key> \
PROVERD_URL=http://127.0.0.1:8799 \
ASSET=USDC \
ASP=0x0000000000000000000000000000000000000000 \
node src/deploy-testnet.mjs
```

Dies deployt `TransactionVerifier`, den Token, `ShieldedPool` (mit dem Poseidon2-
Leerbaum-`initialRoot`) und `PoolRegistry`, **registriert den Pool** in der Registry und
schreibt `deployment.<chainId>.json`.

> Ebenfalls akzeptierte Env-Variablen: `BASE_SEPOLIA_RPC`, `BASE_SEPOLIA_DEPLOYER_KEY`. Eine
> `.env.testnet` im Repo-Root (git-ignoriert) wird als Fallback gelesen.

### Lokaler Probelauf (beweist das Skript, bevor echtes Gas anfällt)

```bash
cd packages/contracts && npx hardhat node &          # chainId 31337
cd packages/prover-gnark && go run ./cmd/proverd ./keys :8799 &
cd apps/demo
RPC=http://127.0.0.1:8545 \
DEPLOYER_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
node src/deploy-testnet.mjs                            # ✅ deploys + registers locally
```

## Mainnet-Checkliste (zwingende Voraussetzungen vor echtem Wert)

1. **Ersetzen Sie das Trusted Setup** durch eine Mehrparteien-Phase-2-Zeremonie; exportieren Sie den
   Verifier aus dem `vk` der Zeremonie neu.
2. Deployen Sie gegen den **echten Asset-Token** (nicht `MockERC20`).
3. Setzen Sie `guardian`, `asp` und den Eigentümer der `PoolRegistry` auf ein **Multisig + Timelock**.
4. Veröffentlichen Sie den ersten ASP-Good-Set-Root (`publishAspRoot`), falls im Compliance-Modus
   (`ASP != 0`) betrieben.
5. Unabhängiges externes **Audit** von Contracts + Circuit.
6. Verweisen Sie die Wallet-/SDK-Konfiguration auf die neuen Adressen für `pool` / `verifier` / `registry`.

## Was sich für ein echtes Netzwerk gegenüber lokal ändert

Nur `RPC`, `DEPLOYER_KEY` und (optional) `ASSET`/`ASP`. Die Contracts, das Circuit, die Keys
und der Verifier sind identisch mit dem, was der 1000-tx-Soak + die adversariale Batterie geprüft haben.
