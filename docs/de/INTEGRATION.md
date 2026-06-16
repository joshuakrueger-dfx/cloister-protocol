# Cloister — Integrationsleitfaden

Wie Cloister in eine Wallet integriert wird (der dfx-wallet-Pfad) und wie die Bausteine zusammenspielen.

## 1. Natives Prover-Modul (iOS)

Die Wallet nutzt ein lokales Expo-Modul, `dfx-wallet/modules/cloister-prover`, das das
per gomobile gebaute `Cloister.xcframework` kapselt und die Proving Keys im App-Bundle ausliefert.

Bauen Sie die nativen Artefakte neu (sie sind git-ignoriert, ~75 MB):

```bash
cd packages/prover-gnark
./scripts/build-ios.sh ~/DFXswiss/dfx-wallet   # setup keys → gomobile bind → install
```

Anschließend in der Wallet:

```bash
npx expo prebuild --clean
(cd ios && pod install)
```

JS-Schnittstelle (`modules/cloister-prover/index.ts`):

```ts
import { initProver, isReady, hash, prove } from 'cloister-prover';
await initProver();              // load keys (idempotent)
const h = await hash([1n, 2n]);  // Poseidon2 → bigint
const { a, b, c, publicSignals, proofHex } = await prove(witnessInput);
```

## 2. SDK an das native Backend anbinden

Fügen Sie `@cloister/sdk` der `package.json` der Wallet hinzu (file:-Link oder veröffentlicht), dann
einmalig beim Start / vor der ersten Zahlung:

```ts
import { wireCloisterNativeBackend } from '@/features/cloister/proverBackend';
await wireCloisterNativeBackend();   // routes SDK hashing + proving to the native module
```

`proverBackend.ts` ruft `setHashBackend` / `setProveBackend` aus `@cloister/sdk` auf.

## 3. Bauen, beweisen, einreichen

```ts
import { MerkleTree, Note, Keypair, buildTransaction, submitShielded, syncWithFallback } from '@cloister/sdk';

// keep the tree in sync (indexer → chain-scan fallback)
await syncWithFallback({ indexerUrls, pool, tree, wallets });

// build + prove on-device, then submit (idempotent, with fallback)
const tx = await buildTransaction({ tree, inputs, outputs, extAmount, fee, recipient });
const res = await submitShielded(tx, {
  relayerUrls,            // privacy-preserving broadcast
  rpcUrls,                // idempotency check + optional direct fallback
  poolAddress,
  // allowDirect: true, directKey   // opt-in liveness fallback (reveals sender)
});
// res.status ∈ { 'broadcast', 'already-onchain' }; res.txHash, res.via
```

## 4. Relayer + Indexer (Backend)

- Der Relayer (`packages/api`, `npm start`) stellt das reine Broadcast-`/v1/shielded/submit` und
  `/config` bereit. Er bindet `proverd` nur für die server-gestützten Shield/Settle-Demo-Flows ein; der
  Private-Pay-Pfad der Wallet ist reines Broadcasting.
- Der Indexer (`packages/indexer`) liefert `/commitments?from=` für die view-tag-gefilterte Discovery.
- Betreiben Sie `proverd` neben dem Backend für jegliches serverseitige Hashing (Tree-Roots in Deploy /
  Indexer): `cd packages/prover-gnark && go run ./cmd/proverd ./keys :8799`, und verweisen Sie die Node-
  Komponenten anschließend per `useHttpBackend('http://…')` darauf.

## 5. Deployment

```bash
cd packages/prover-gnark && go run ./cmd/setup .      # keys + Groth16Verifier.sol
# copy build/Verifier.sol → packages/contracts/contracts/Groth16Verifier.sol (renamed)
cd packages/contracts && npx hardhat compile
# wire a hash backend (proverd) in your deploy script, then:
node -e "import('@cloister/contracts/deploy').then(({deployAll}) => …)"
```

`deployAll(signer, { asp })` deployt `TransactionVerifier`, den Token, `ShieldedPool`
(mit dem Poseidon2-Leerbaum-`initialRoot`) und `PoolRegistry`. **Setzen Sie ein Hash-Backend
(`useHttpBackend`), bevor Sie den Aufruf tätigen** — der Leerbaum-Root wird mit Poseidon2 berechnet.

## Reihenfolge der Public Signals (muss überall übereinstimmen)

`[Root, PublicAmount, ExtDataHash, InputNullifier0, InputNullifier1, OutputCommitment0,
OutputCommitment1, NewRoot, PairIndex, AssociationRoot]`
