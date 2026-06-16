# Cloister Protocol — External Security Audit · Scope & Engagement Brief

**Status:** draft for auditor selection · **Audited revision:** `main @ e47009f`
**Owner:** DFX AG · **Prepared:** 2026-06-16

This brief is written for a ZK-circuit + Solidity audit firm (e.g. a team with both
gnark/Groth16 and EVM depth). It states exactly what to audit, the trust model, the
properties that must hold, and the **known findings already on the backlog** so you do
not spend budget re-discovering them. Read [`CEREMONY_RUNBOOK.md`](./CEREMONY_RUNBOOK.md)
alongside this — the trusted-setup ceremony has a hard dependency on the circuit freeze
defined here.

---

## 0. One-paragraph system description

Cloister is a non-custodial **shielded pool** for stablecoin payments on EVM chains.
Notes are Poseidon2 commitments in a fixed-depth (levels=20) append-only Merkle tree.
Spends publish nullifiers; value conservation, membership, nullifier derivation, range,
and **association-set (ASP) membership** are proven in a gnark **Groth16/BN254** circuit
(2-in/2-out). A relayer broadcasts the tx so the payer's address never appears on-chain.
Compliance is an **association root** (good-set) the circuit must prove membership in and
the contract must recognize. KYC/sanctions screening happens **only at the shield (deposit)
boundary**, off-chain.

---

## 1. In scope (audit these)

### 1.1 Smart contracts — `packages/contracts/contracts/`
| File | ~LOC | Why it matters |
|---|---|---|
| `ShieldedPool.sol` | 355 | Core: deposit/withdraw/transfer, nullifier set, root history, lane parallelism, ASP gate, guardian/emergency controls |
| `Groth16Verifier.sol` | 635 | Auto-exported gnark verifier (BN254, 10 public signals) — **do not hand-edit**; audit the generated pairing logic + public-input order |
| `TransactionVerifier.sol` | 36 | Adapter: bytes proof ↔ (a,b,c); public-signal packing order |
| `PoolRegistry.sol` | 77 | chainId+asset → pool/verifier/token; append-only + 2-step migrate |
| `interfaces.sol` | 20 | Minimal interfaces |

Stack: Solidity `^0.8.20`, OpenZeppelin `^5.1.0` (SafeERC20, ReentrancyGuard, Ownable2Step).

### 1.2 ZK circuit + prover — `packages/prover-gnark/`
- `zk/circuit.go` (133) — the constraint system (the highest-value target).
- `zk/note.go`, `zk/merkle.go`, `zk/hash.go` — note/nullifier derivation, Merkle climb, Poseidon2.
- `zk/deposit.go`, `zk/witness.go`, `zk/wire.go` — witness construction + public-signal extraction.
- `prover/prover.go` — proving hot path + self-verify.
- `keys/` — `circuit.r1cs`, `pk.bin`, `vk.bin`, `SETUP_MANIFEST.md` (provenance).
- gnark `v0.15.0`, gnark-crypto `v0.20.1`.

### 1.3 SDK proof/witness path — `packages/sdk/`
Only the parts that build witnesses, public signals, ASP trees, and extData binding
(`src/witness.js`, `src/note.js`, `src/sync.js`). The rest of the SDK is non-critical.

### 1.4 Relayer / compliance submit path — `packages/api/`
- `src/server.js` (`/v1/shield`, `/v1/shielded/submit`, `ensureAspRoot`) — **carries the
  P1-10 compliance-bypass finding (see §5)**; audit the ASP-root advancement logic.
- `src/kyc.js` — the screening function (currently a hardcoded sample list; see §5).
- `src/deposit-relayer.mjs` — what the relayer sees/logs.

### 1.5 Cross-language constant integrity
`scripts/check-constants.mjs` + `provenance/provenance_test.go` — verify the CI gates that
keep `FIELD_SIZE`, `levels`, and `vk.bin ↔ Groth16Verifier.sol` in sync actually close the
loophole they claim to.

---

## 2. Explicitly OUT of scope
- `apps/web` (the Console / dashboard), `apps/demo`, `website/`, `coming-soon/`, `docs*`,
  `brand/`. These are presentation; no funds logic. **Do not spend budget here.**
- The light theme, accounting export (DATEV/SEPA), Kontierung, master data, approvals UI —
  all client-side, no protocol surface.

---

## 3. Trust model & assumptions the auditor should challenge
1. **Single-party trusted setup (CURRENT).** `keys/` were produced by one `groth16.Setup()`.
   The setup party could hold toxic waste and forge proofs → **mint unbacked notes**. This
   is the #1 fund-safety risk and is *not* fixed by code review — it is fixed by the
   ceremony in [`CEREMONY_RUNBOOK.md`](./CEREMONY_RUNBOOK.md). Mainnet is gated on it.
2. **ASP is a single trusted entity.** The good-set root is published by one `asp` address.
   Monotonicity is a *trust assumption*, not an on-chain invariant (hence `revokeAspRoot`).
   Audit: can a compromised/negligent ASP, or the relayer's auto-publish path, inject a
   non-vetted root? (See P1-10, §5.)
3. **Relayer centralization.** One relayer = deanonymization + liveness + censorship single
   point, and sees the recipient address in `extData`. In scope: does it store/leak more
   than necessary (IP logging in `deposit-relayer.mjs`)?
4. **extDataHash is intentionally NOT relation-constrained in the circuit** — binding is
   enforced **on-chain only** via `keccak256(abi.encode(extData)) % FIELD`. Confirm this is
   actually sufficient and that no path lets a relayer alter `extAmount`/`recipient`/`fee`.

---

## 4. Properties that MUST hold (prioritized test targets)

**Critical (fund safety / soundness):**
- **C1 Value conservation:** `sumIn + publicAmount == sumOut (mod FIELD)`; no path mints value. Check the field-encoded negative (withdraw) arithmetic for wraparound.
- **C2 Double-spend:** nullifier uniqueness on-chain **and** in-circuit (`nullifier[0] != nullifier[1]`); **cross-lane** double-spend prevented (global nullifier set vs per-lane roots).
- **C3 Off-chain insertion soundness:** empty-pair → new-pair Merkle update (`PairIndex`, levels 1..19) cannot be forged to insert arbitrary commitments or corrupt the root.
- **C4 Nullifier derivation:** `nullifier = H(commitment, leafIndex, signature)`, `signature = H(privKey, commitment, leafIndex)`, `pubKey = H(privKey)` — no self-double-spend / malleability (the single-hash pubKey choice).
- **C5 Range checks:** `0 ≤ amount < 2^248` on every note; confirm no over/underflow escapes (incl. `MAX_EXT_AMOUNT = 2^248`).
- **C6 Verifier ↔ key provenance:** `Groth16Verifier.sol` is byte-derived from `vk.bin`; public-signal **order** in the verifier matches the circuit (a reorder = silent acceptance of wrong statements).
- **C7 Reentrancy / CEI:** state (nullifier, root, index) written before token transfer; ERC-777/1363 hooks cannot re-enter; SafeERC20 + fee-on-transfer rejection hold.

**High (compliance integrity):**
- **H1 ASP gate:** every real input proves association membership against a root the
  contract recognizes; `asp == address(0)` dev mode is clearly distinct from enforced mode;
  the auto-publish bypass (P1-10) is closed.
- **H2 Dummy-input handling:** 0-amount inputs skip membership/association without opening a
  soundness hole.

**Medium:** lane index overflow guard (`numLanes << levels ≤ uint32.max`), guardian pause
semantics (deposit-only pause; emergency 72h-bounded; withdrawals always open), 2-step role
transfers, registry append-only invariants.

---

## 5. Known findings backlog (do NOT re-report; verify the fix or the deferral)

The team already runs an internal review (incl. the "Big Brother" agent pass and a
concurrent circuit/wallet review). Current state at `e47009f`:

| Ref | Finding | Severity | Status / disposition |
|---|---|---|---|
| **P1-9** | `kyc.js` sanctions screening is a **hardcoded ~18-name sample** (`SANCTIONS_NAMES`, incl. "Tornado Cash"); `loadFullSdn` is referenced but **does not exist**. Real OFAC SDN / EU consolidated lists never load → passes virtually any sanctioned party. | **Critical (compliance)** | OPEN — must be replaced with a real, maintained screening provider before any real funds. In audit scope as a confirmed gap, not a re-discovery. |
| **P1-10** | `/v1/shielded/submit` → `ensureAspRoot` **auto-publishes any caller-supplied `associationRoot`** via `publishAspRoot`. Attacker can prove membership in their own tree of non-vetted commitments and have the relayer legitimize it → **on-chain compliance gate defeated**. `quoteId` marked paid with no commitment binding. | **Critical (compliance)** | OPEN — fix: never auto-publish caller roots; ASP advances good-set only from its own verified set; validate all inputs; bind quote→commitment; add auth + rate limit. **Please independently confirm the fix once applied.** |
| **#1** | Wallet **fail-fast root check** missing in `deposit.ts` — wallet should verify the live on-chain Merkle root before building/spending; proving against a stale/wrong root wastes proofs and can mask sync bugs. | Medium | OPEN (wallet side, active session). In scope for the SDK/wallet proof path. |
| **#8** | **`publicAmount` range** constraint (circuit). | Medium | **DEFERRED → ceremony.** ⚠️ **Circuit-changing.** Must be resolved and folded into the FINAL frozen circuit **before** Phase-2 (see §6). |
| **(regen)** | **Key / verifier regeneration** (`pk.bin`/`vk.bin`/`Groth16Verifier.sol`). | n/a | **DEFERRED → ceremony.** Any circuit change (#8) forces this; the ceremony produces the final keys. |
| **#12/#13** | Wallet: **Cloister pay E2E** coverage + **de-flake Maestro** mobile tests. | Medium (test integrity) | OPEN (active session). Relevant because audit conclusions rest on the E2E suite being trustworthy. |
| **F1** | `proverd` bound all interfaces (`:8799`), exposing the private witness on LAN. | Low (dev) | **Fixed** — defaults to `127.0.0.1:8799`. |
| **F2–F5** | proverd idempotency no-op without `rpcUrls`; direct-RPC fallback reveals sender (opt-in); `deployAll` deploys MockERC20 (testnet); circuit `AssertIsEqual(ExtDataHash,ExtDataHash)` looks like a no-op but Groth16 binds all public inputs (confirmed by adversarial test). | Low/Info | Documented / by-design. Please sanity-check F5 (public-input binding) independently. |

**Note on backlog completeness:** items #1–#13 originate in an active internal review; only
the entries above are surfaced here. Ask the team for the live backlog before kickoff so
nothing in the #2–#11 range is missed.

---

## 6. The hard sequencing gate (read before the ceremony)

> **The Phase-2 MPC ceremony output is only valid for the EXACT circuit it was run on.**
> Any circuit change — including the deferred **#8 publicAmount range** — invalidates the
> ceremony. Therefore:
>
> 1. Resolve **all circuit-changing findings** (#8 + anything the audit raises in §4 C1–C6).
> 2. **Freeze `zk/circuit.go`** (tag it; publish `circuit.r1cs` hash).
> 3. *Then* run the ceremony (`CEREMONY_RUNBOOK.md`) and re-export the verifier.
> 4. Redeploy `ShieldedPool` + `PoolRegistry` against the ceremony verifier.
>
> Running the ceremony before the circuit is frozen = wasted ceremony. This is the single
> most common sequencing mistake; the audit's circuit findings MUST land first.

---

## 7. Deliverables expected from the auditor
1. Findings report (severity-rated, with PoC where applicable), separating **soundness/fund-safety** from **compliance-integrity** from **best-practice**.
2. Explicit written opinion on **C1–C7 + H1–H2** (hold / do-not-hold).
3. Independent confirmation of the **provenance gate** (does `vk.bin ↔ Groth16Verifier.sol`
   sync actually prevent a verifier/key mismatch reaching mainnet?).
4. A **fix-verification round** after remediation (re-test the patched commit).
5. Optional but desired: participation as an **independent Phase-2 ceremony contributor**
   (see runbook) — auditor-as-contributor materially strengthens the setup's credibility.

---

## 8. Logistics
- **Repo / revision:** private; access on NDA. Audited revision **pinned to a tag** cut from
  `e47009f` after the circuit freeze (§6). Do not audit a moving `main`.
- **Build & test (reproducible):**
  - Go: `cd packages/prover-gnark && go test -race ./...` (incl. soundness + provenance).
  - Contracts: `cd packages/contracts && npx hardhat test` (12 suites + 1000-tx soak + 7/7 adversarial battery).
  - Cross-lang constants: `node scripts/check-constants.mjs`.
- **Current deployments (testnet only, pre-ceremony, no real funds):** Base Sepolia (84532);
  pool/verifier/registry addresses in `deployment.84532.json`, `deployment.basesepolia.json`;
  `asp = 0x0…0` (permissive dev mode).
- **Out-of-band:** the regulatory/legal classification (MiCA/AMLR/TFR) is being handled
  separately (see `docs/en/validation/LEGAL_QUESTIONS.md` + the legal stress-test) and is
  **not** an audit deliverable — but H1/H2 and P1-9/P1-10 are where code meets that question.

---

## 9. Why this audit is the gate (one sentence)
No amount of product polish substitutes for an external opinion that the circuit is sound
and the verifier matches its key; until C1–C7 hold and the ceremony in §6 is done, Cloister
must move **zero real funds**.
