# Cloister gnark — Integration status

## ✅ Done & verified (protocol layer — fully self-built, IP-clean)

| Step | Status | Evidence |
|------|--------|----------|
| P1 primitives (Poseidon2, note, Merkle) | ✅ | `go test ./zk` — native↔in-circuit hash proven identical |
| P2 transaction circuit (+ASP compliance) | ✅ | 50,481 constraints (−11% vs old, +compliance) |
| P3 Groth16 setup + Solidity verifier (MIT) | ✅ | persisted keys, `cmd/setup` exports verifier |
| P4 prover library + benchmark | ✅ | **~190–220 ms** vs 1,780 ms snarkjs = **~8×** |
| I1 SDK wire format ↔ circuit | ✅ | `TestWireRoundTrip` — round-trips identically + solves |
| I2 iOS native framework (gomobile) | ✅ | `build/Cloister.xcframework` (device+sim), Swift API: `MobileInit/Prove/Hash/Ready` |
| On-chain verify + real-proof deposit | ✅ | **12/12 contract tests** — genuine proof drives `transact`, replay rejected |

The complete chain is proven: gnark circuit (Poseidon2) → real proof → `(a,b,c)` adapter
→ gnark Solidity verifier → `ShieldedPool.transact` → state update. `extDataHash` binds
correctly cross-language (JS keccak ↔ Go witness).

## ✅ Done & verified (wallet integration — code complete)

| Step | Status | Evidence |
|------|--------|----------|
| I3 key bundling | ✅ | keys shipped via `CloisterProver.podspec` `s.resources`; Swift resolves the bundle dir → `MobileInit` |
| I4 RN native module | ✅ code | local Expo module `dfx-wallet/modules/cloister-prover` (Swift wraps the xcframework, correct C-function/`NSError**` bridging) |
| I5 SDK rewire | ✅ **verified** | SDK crypto rebuilt to the gnark scheme (curve-free `pubKey=H(priv)`, Poseidon2, `ZERO_VALUE=0`); pluggable backend (native / proverd). **Node E2E proves a real proof** (`packages/sdk/test/e2e-native.mjs` via `cmd/proverd`) → the rewired SDK satisfies the circuit exactly |

The SDK rewire is verified without a device: a successful prove of an SDK-built witness
is only possible if `pubKey=H(priv)`, `commitment=H(...)`, the `H(0,0)` empty leaf and
membership all match the circuit — which they now do.

## ⏳ Remaining (needs device + resources)

| Step | Work | Needs from you |
|------|------|----------------|
| build verify | `expo prebuild --clean` + `pod install` + Xcode build with `modules/cloister-prover` | a wallet build run |
| pay-screen rewire | Replace the hosted WebView in `app/(auth)/pay/cloister.tsx` with a direct SDK call (`wireCloisterNativeBackend()` + `buildTransaction`) | best done against the redeployed pool |
| I6 testnet redeploy | Deploy new `TransactionVerifier` + fresh `ShieldedPool` (Poseidon2) on Base Sepolia; update config | **deployer key (.env.testnet) + testnet funds** |
| I7 device E2E | Real Cloister Silent-Pay on the iPhone, verify <1 s | **your physical iPhone + a running relayer pointed at the new pool** |

### Wallet wiring (I4/I5)

- Native module: `dfx-wallet/modules/cloister-prover` (autolinked Expo module). Rebuild
  its artifacts with `prover-gnark/scripts/build-ios.sh`.
- Add `@cloister/sdk` to the wallet's `package.json` (file: link or published).
- Call `wireCloisterNativeBackend()` (`src/features/cloister/proverBackend.ts`) once
  before the first payment; the SDK then proves on-device.

### Architecture change in I5

Today the SDK + snarkjs + circomlib all run inside the hosted `cloister-pay.html`
WebView. The native prover moves proving + hashing on-device, so the cleanest design
runs the SDK orchestration directly in the RN JS layer (Hermes), calling the native
module for hashing and proving. This removes the WebView, the engine hosting, and the
cross-origin concerns entirely — and makes proving work fully offline (only the final
relayer/RPC submission needs network).

## Speed outlook

Desktop prove is ~200 ms. On-device (A2) is expected ~0.4–1 s on a modern iPhone;
combined with **A3 witness-precompute + background tree sync** (build the witness while
the user reviews the amount) and **A4 optimistic "Paid"**, the *perceived* time is
near-instant — comfortably under the 1 s goal.
