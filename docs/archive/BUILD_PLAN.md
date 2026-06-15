# Cloister App — Build Plan (full-functionality target)

> Goal: a **fully functional** Cloister web app — every screen wired to the real protocol —
> with **in-proof ASP compliance (Level 3)**, dual backend (local + Base Sepolia),
> self-custody seed **+ KYC + DFX login**, top-notch design.
> Decisions (2026-06-13): web app · Vite+React+TS · dual backend · seed+KYC+DFX · ASP in circuit.

## Architecture

```
                         ┌─────────────── Cloister Web App (apps/web, Vite+React+TS) ───────────────┐
   seed → keys           │  Auth/KYC/DFX → Vault → Overview · Fund · Disburse · Recipients ·         │
   (spend/view/null)     │  Activity · Compliance Center · Settings    via useApi() (CloisterApi)    │
                         └───────────────┬───────────────────────────────────────┬─────────────────┘
                                         │ @cloister/sdk (browser build)          │ snarkjs prover (wasm/zkey)
                                         ▼                                         ▼
   indexer (view-tags) ◀── note sync ── SDK: keys, notes, merkle, ASP tree, witness, OcpClient
   asp service ◀── good-set/root ────────┘                                         │ groth16 proof
   relayer ◀── submit (pays gas) ──────────────────────────────────────────────────┘
       │ publishes associationRoot + transact
       ▼
   ShieldedPool (per chain) — Off-chain insertion + lanes + ASP root gating + Groth16 verify
```

## Protocol changes (ASP in proof) — DONE & VERIFIED

- **Circuit** (`packages/circuits`): `transaction.circom` now binds a public `associationRoot`
  and proves, per real input, that the input commitment ∈ the ASP good-set Merkle tree
  (`ForceEqualIfEnabled`, disabled for dummy/zero inputs). `transaction2.circom` lists
  `associationRoot` as the last public signal. Rebuilt: **57k → 78,044 constraints**, ptau-18,
  fresh local Groth16 setup, verifier re-exported (`uint[10]`). ✅
- **Contracts** (`packages/contracts`): `ShieldedPool` gains an `asp` role, `aspRoot` +
  `knownAspRoot` (monotone good-set ⇒ old roots stay valid), `publishAspRoot`/`transferAsp`,
  and `transact*/_transact` take `associationRoot` (pub array → `uint[10]`). `asp == 0` =
  permissive dev mode (keeps PoC demos working). Interface + MockVerifier → `uint[10]`. ✅
- **SDK** (`packages/sdk`): `buildWitness` accepts an `aspTree` (+ per-input `aspIndex`) and
  emits `associationRoot` + `inAspPath*`; default `aspTree = pool tree` (back-compatible). ✅
- **Verification:** `pnpm --filter @cloister/contracts test` (6/6 guards pass); `pnpm demo`
  (direct shield→pay→settle, real proofs) and `pnpm demo:api` (HTTP relayer E2E) both green
  with the new circuit. ✅

## Remaining work (tracked as tasks #1, #4–#14)

### Protocol / services
- **SDK key hierarchy:** BIP39 seed → deterministic spend/view/nullifier keys; encrypted
  local vault. ASP-tree helper exposed for the app.
- **ASP service** (`packages/asp` or extend `indexer`): maintain the good-set (KYC deposits +
  clean descendants), publish `associationRoot` on-chain (`publishAspRoot`), serve inclusion
  paths. Relayer already plumbs `associationRoot` (+ `ensureAspRoot` under `ASP_ENFORCE=1`).
  - Shield (deposit, dummy inputs): `associationRoot` = current published `aspRoot` (in-circuit
    check disabled, contract just needs a *known* root).
  - Pay (real inputs): `associationRoot` = good-set root that includes the spent notes.
- **Testnet redeploy:** deploy the new verifier + ASP-enabled pool to Base Sepolia; update
  `deployment.basesepolia.json` + registry.

### App (apps/web)
- **Scaffold** (in progress, background agent): Vite+React+TS, design system from
  `website/index.html` tokens, components, screens, typed `CloisterApi` + `MockApi`, auth flow.
- **Auth:** seed create/import + password vault + KYC step (provider interface; local mock
  signs a KYC attestation that gates Fund + seeds the ASP good-set) + DFX-login adapter.
- **Dual backend:** registry-driven switch (local ↔ Base Sepolia): RPC, pool/verifier/registry,
  relayer/indexer/ASP endpoints, wasm/zkey artifact URLs.
- **Screens (each wired to real SDK):** Overview (balance/notes/anonymity-set/compliance),
  Fund (real deposit + KYC gate + ASP add), Disburse (single real proof+relayer, batch over
  lanes + aggregated settle, payroll spending-session), Recipients (encrypted address book),
  Activity (viewing-key-decrypted ledger + export), Compliance Center (in-circuit
  proof-of-innocence receipt, scoped viewing-key disclosure, ASP status, EU/US profiles),
  Settings (keys/recovery, infra, backend switch).
- **Dev runner:** one command to bring up node + api(relayer) + indexer + asp + app for
  100% local E2E.
- **Polish + verification:** motion/states/responsive/a11y; click every function in the real
  stack; screenshot each screen; verify a real proof+settle.

## Known PoC boundaries (honest)
- Local Groth16 setup is single-contributor (dev). Production needs a real MPC ceremony + audit.
- ASP good-set policy (recursive "clean descendants") is computed off-chain by the ASP service;
  the circuit only proves membership in the published root (Privacy-Pools model).
- DFX login / KYC use a provider interface with a local mock; real DFX backend wiring is the
  adapter swap.
</content>
