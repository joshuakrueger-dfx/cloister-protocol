# Go-Live — Cloister Console

How to take the Console from the hosted **Demo** to a **live** deployment, and
exactly what the DFX KYC integration needs. The app is built so going live is a
matter of **configuration**, not code changes.

---

## 0) Where it runs today
- **app.cloister-protocol.com** — the Console (Vite SPA + PWA), served from the
  Mac mini via Cloudflare Tunnel + Caddy. Builds to the self-contained **Demo**
  backend (mock data) by default, so it always works with no infrastructure.
- **dev.cloister-protocol.com** (website), **docs.cloister-protocol.com**,
  **cloister-protocol.com** (coming-soon) — static, already live.

## 1) Build configuration (`apps/web/.env.production`)
Copy `apps/web/.env.example`. Nothing set → Demo. To go live, set:

| Variable | Purpose | Example |
|---|---|---|
| `VITE_API_URL` | Deployed Cloister provider (serves `/config`, `/v1/shield`, `/v1/kyc/screen`, relayer/indexer). Setting it **adds a "Production" backend and makes it the default**. | `https://api.cloister-protocol.com` |
| `VITE_API_LABEL` / `VITE_API_META` | Cosmetic label/sub for that backend | `Production` / `Base mainnet` |
| `VITE_DFX_API_URL` | DFX API. Prod `https://api.dfx.swiss`, sandbox `https://dev.api.dfx.swiss` | `https://api.dfx.swiss` |
| `VITE_DFX_KYC_URL` | DFX-hosted KYC page. Prod `https://app.dfx.swiss/kyc`, sandbox `https://dev.app.dfx.swiss/kyc` | `https://app.dfx.swiss/kyc` |

Build + deploy: `pnpm --filter @cloister/web build` → rsync `apps/web/dist/` to the app host.

## 2) DFX KYC — already wired, here's how it works
The DFX integration (`apps/web/src/lib/dfx/`) talks directly to the DFX API
(`Access-Control-Allow-Origin: *`, no proxy needed). It is **backend-independent** —
it works the same whether the Cloister backend is Demo or Production.

**Flow (already implemented):**
1. **Connect** — `DfxConnect` signs the user in to the DFX API with one of three
   methods (in-app derived key / browser wallet / email magic-link) → JWT.
2. **KYC status** — `getDfxKyc()` reads the real level from `GET /v2/kyc`
   (`x-kyc-code` header). Levels: 0 none · 10–20 contact/personal · ≥30 full.
   Mapped to the app's tiers (≥40→L3, ≥30→L2, else L1).
3. **Start / continue KYC** — `startDfxKyc()` returns the interactive step URL
   from `PUT /v2/kyc`, and falls back to the DFX-recommended hosted page
   `app.dfx.swiss/kyc?session=<jwt>`. The user completes KYC in that tab.
4. **Bind to the session** — when the user continues after DFX reports verified,
   `KycVerify` records the real tier via `api.markVerifiedExternally({ level })`.
   That unlocks funding + payouts and removes the "verify identity" gate.

**To go live with DFX, you only need to:**
- [ ] Point `VITE_DFX_API_URL` / `VITE_DFX_KYC_URL` at prod (or sandbox to test).
- [ ] Confirm the DFX account/partner setup (referral/`wallet` code if DFX assigns one — pass via `dfxAuthService.login` options).
- [ ] (Optional) Swap the hand-rolled client for the official `@dfx.swiss/services`
      widget or `@dfx.swiss/react` if you prefer DFX to own the KYC UI — the
      seams (`connect` / `getDfxKyc` / `startDfxKyc`) map 1:1.

> Sandbox first: set the two DFX vars to `dev.api.dfx.swiss` / `dev.app.dfx.swiss`
> and run a full connect → KYC → buy → on-chain-deliver → shield pass.

## 3) Cloister backend (the part that needs real infrastructure)
The Production backend (`VITE_API_URL`) must serve the same shape the Local stack
does (`packages/api`): `GET /config` (pool, relayer, indexer, aspRoot,
dfxShieldAddress), `POST /v1/shield`, `POST /v1/kyc/screen`, relayer submit.
- [ ] Deploy `packages/contracts` (ShieldedPool, verifier, PoolRegistry) to the target chain.
- [ ] Deploy `packages/api` (relayer/provider) + `packages/indexer` behind a public HTTPS URL.
- [ ] Put that URL in `VITE_API_URL`.

## 4) Production blockers (must clear before real funds)
- [ ] **External security audit** of contracts + circuit.
- [ ] **Multi-party Phase-2 trusted-setup ceremony** (replaces the single-run keys).
- [ ] Real **mail backend** for the onboarding one-time code (today it's a device-side PoC code).
- [ ] Submit **retry/idempotency** + relayer/indexer **health** surfacing (see TODO.md).

## 5) Pre-launch checklist
- [ ] `pnpm --filter @cloister/web build` clean (tsc + vite).
- [ ] DFX sandbox pass (connect → KYC → buy → shield).
- [ ] Production backend reachable; `/config` returns the right pool/relayer/indexer.
- [ ] PWA installs + offline shell loads; manifest + icons served.
- [ ] DE/EN both render without overflow.
- [ ] Disclaimer/Imprint/Privacy current (docs site).

See `TODO.md` for the broader roadmap.
