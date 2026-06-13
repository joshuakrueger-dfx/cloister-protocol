# Cloister — Integration guide

How to integrate Cloister into a wallet (the dfx-wallet path) and how the pieces fit.

## 1. Native prover module (iOS)

The wallet uses a local Expo module, `dfx-wallet/modules/cloister-prover`, which wraps the
gomobile-built `Cloister.xcframework` and ships the proving keys in the app bundle.

Rebuild the native artifacts (they are git-ignored, ~75 MB):

```bash
cd packages/prover-gnark
./scripts/build-ios.sh ~/DFXswiss/dfx-wallet   # setup keys → gomobile bind → install
```

Then in the wallet:

```bash
npx expo prebuild --clean
(cd ios && pod install)
```

JS surface (`modules/cloister-prover/index.ts`):

```ts
import { initProver, isReady, hash, prove } from 'cloister-prover';
await initProver();              // load keys (idempotent)
const h = await hash([1n, 2n]);  // Poseidon2 → bigint
const { a, b, c, publicSignals, proofHex } = await prove(witnessInput);
```

## 2. Wire the SDK to the native backend

Add `@cloister/sdk` to the wallet `package.json` (file: link or published), then once at
startup / before the first payment:

```ts
import { wireCloisterNativeBackend } from '@/features/cloister/proverBackend';
await wireCloisterNativeBackend();   // routes SDK hashing + proving to the native module
```

`proverBackend.ts` calls `setHashBackend` / `setProveBackend` from `@cloister/sdk`.

## 3. Build, prove, submit

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

## 4. Relayer + indexer (backend)

- Relayer (`packages/api`, `npm start`) exposes broadcast-only `/v1/shielded/submit` and
  `/config`. It wires `proverd` only for the server-assisted shield/settle demo flows; the
  wallet's private-pay path is broadcast-only.
- Indexer (`packages/indexer`) serves `/commitments?from=` for view-tag-filtered discovery.
- Run `proverd` alongside the backend for any server-side hashing (tree roots in deploy /
  indexer): `cd packages/prover-gnark && go run ./cmd/proverd ./keys :8799`, then point Node
  components at it via `useHttpBackend('http://…')`.

## 5. Deploy

```bash
cd packages/prover-gnark && go run ./cmd/setup .      # keys + Groth16Verifier.sol
# copy build/Verifier.sol → packages/contracts/contracts/Groth16Verifier.sol (renamed)
cd packages/contracts && npx hardhat compile
# wire a hash backend (proverd) in your deploy script, then:
node -e "import('@cloister/contracts/deploy').then(({deployAll}) => …)"
```

`deployAll(signer, { asp })` deploys `TransactionVerifier`, the token, `ShieldedPool`
(with the Poseidon2 empty-tree `initialRoot`) and `PoolRegistry`. **Set a hash backend
(`useHttpBackend`) before calling** — the empty root is computed with Poseidon2.

## Public-signal order (must match everywhere)

`[Root, PublicAmount, ExtDataHash, InputNullifier0, InputNullifier1, OutputCommitment0,
OutputCommitment1, NewRoot, PairIndex, AssociationRoot]`
