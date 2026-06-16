# Cloister — Phase-2 Trusted-Setup Ceremony · Execution Runbook

**Status:** execution plan (operationalizes [`../concepts/MPC_CEREMONY.md`](../concepts/MPC_CEREMONY.md))
**Depends on:** [`AUDIT_SCOPE.md`](./AUDIT_SCOPE.md) §6 (circuit freeze) · **Owner:** DFX AG

Groth16 needs a per-circuit Phase-2 on top of a universal Phase-1 (Powers of Tau).
**Security holds if ≥1 honest contributor deletes their secret.** This runbook turns that
into concrete steps, people, commands, and gates.

---

## 0. Hard prerequisites (do not start until ALL are true)

- [ ] **Circuit frozen.** All circuit-changing findings resolved and merged — explicitly
      including **#8 publicAmount range** and any C1–C6 finding from the audit. `zk/circuit.go`
      tagged; `circuit.r1cs` regenerated and its SHA-256 published. *(See AUDIT_SCOPE §6 — a
      ceremony on a non-final circuit is wasted.)*
- [ ] **Audit fixes landed.** The external audit's soundness findings are merged into the
      frozen revision (the ceremony binds to THIS circuit forever).
- [ ] **Ceremony tooling built & published** (`cmd/ceremony`, see §2) and dry-run-tested by
      two people on throwaway entropy.
- [ ] **Phase-1 selected & pinned** (§1).
- [ ] **Beacon chosen & announced in advance** (§4) — a future, unpredictable, public value.
- [ ] **≥5 contributors confirmed** with slots, machines, and comms channel (§3).

---

## 1. Phase-1 (universal) — reuse, do not self-run

- Reuse a large, well-known existing Powers-of-Tau, sized **≥ 2^17** (circuit ≈ 50,481
  constraints → 2^16 is too small; take 2^17+ with margin for #8's added constraints).
- Candidates: the established community `pot` transcripts (Hermez/Perpetual Powers of Tau).
  Pin the **exact file + its published hash** in the manifest; never run our own Phase-1.
- Convert/ingest into gnark's format via the ceremony tool's `phase1 import` step and record
  the resulting hash.

**Output:** `phase1.pinned` (file + SHA-256 + provenance URL), committed to the repo.

---

## 2. Tooling to build first — `packages/prover-gnark/cmd/ceremony`

Wrap `github.com/consensys/gnark/backend/groth16/.../mpcsetup`. Three subcommands:

| Subcommand | Does | Output |
|---|---|---|
| `ceremony init` | Phase2 init from pinned Phase-1 + frozen `circuit.r1cs` | `phase2_000.state`, transcript-0 hash |
| `ceremony contribute --in S_n --out S_{n+1}` | one contribution: add fresh entropy, write next state + transcript entry, **zeroize secret in memory** | `phase2_{n+1}.state`, `transcript_{n+1}.json` |
| `ceremony verify --chain transcript_*.json` | re-run `mpcsetup.Verify` over the full chain; on success derive `pk.bin`/`vk.bin` | `pk.bin`, `vk.bin`, PASS/FAIL |

Requirements:
- Deterministic, single static binary (reproducible build; publish its hash).
- Reads entropy from OS CSPRNG **plus** an operator-supplied passphrase/file (defense in depth).
- Prints the **incoming and outgoing state hash** so a contributor can attest exactly what
  they signed over.
- `--airgap` mode: read state from / write state to a file only (no network), for the
  hardware-isolated contributor.

**Gate:** `ceremony verify` must already be wired into CI as a one-command reproducible check
before the real ceremony begins.

---

## 3. Contributors (≥5, independent)

| # | Suggested contributor | Machine | Mode |
|---|---|---|---|
| 1 | DFX engineering | clean CI-isolated host | online |
| 2 | External auditor A (the firm from AUDIT_SCOPE) | their own host | online |
| 3 | External auditor B / independent cryptographer | their own host | online |
| 4 | Community / ecosystem participant | their own host | online |
| 5 | **Air-gapped** contributor (DFX security) | offline laptop, wiped after | `--airgap`, USB transfer |

Per-contributor protocol (each step is mandatory and attested):
1. Receive previous state `phase2_{n}.state` + the expected incoming hash (out-of-band).
2. Verify the incoming hash matches.
3. `ceremony contribute` with fresh entropy (mash keyboard / hardware RNG / dice into the passphrase).
4. **Destroy the local secret** — the tool zeroizes; additionally power-cycle / wipe the airgap machine.
5. Publish: outgoing state hash + a **signed attestation**: *"I contributed fresh randomness
   and destroyed my secret; I did not collude."* (PGP or org-key signature.)
6. Hand the new state to the coordinator, who passes it to the next contributor.

Coordinator (DFX) sequences contributions, collects transcripts + attestations, and never
needs to be trusted for *soundness* (any single honest deleter suffices) — only for liveness.

---

## 4. Beacon (non-grindable finalization)

- Choose a **future** public random value, announced **before** the ceremony starts, so no
  contributor can grind the last step. Options: a specified future **drand** round, or a
  **Bitcoin block hash** at a pre-named height.
- Apply it as the final `contribute` step (beacon mode) after all human contributors.
- Record the beacon source + value in the manifest.

---

## 5. Finalize, re-export, redeploy

1. `ceremony verify` over the full chain (Phase-1 pin → all contributions → beacon) → derive
   final `pk.bin` / `vk.bin`.
2. **Re-export `Groth16Verifier.sol`** from the ceremony `vk` (the existing auto-export path;
   never hand-edit). The `provenance_test.go` gate must pass: `vk.bin ↔ Groth16Verifier.sol`
   byte-identical.
3. Update `keys/SETUP_MANIFEST.md`: Phase-1 pin, transcript chain hashes, contributor
   attestations, beacon value, final `vk.bin` + `Groth16Verifier.sol` SHA-256.
4. **Redeploy** `ShieldedPool` + `PoolRegistry` against the new verifier address (the old
   single-party-key deployment is abandoned; no migration of testnet notes).
5. Run the full regression (Go race suite, 12 contract suites + soak + adversarial battery,
   SDK E2E) against the redeployed verifier.

---

## 6. Publish (public verifiability)

- The full transcript chain + every contributor attestation.
- The pinned Phase-1 provenance.
- The beacon source/value.
- A **one-command verifier** (`ceremony verify`) + its reproducible binary hash, so any third
  party (auditor, regulator, integrator) can independently confirm the setup.
- The new verifier contract address + deployment artifact.

---

## 7. Gate (unchanged, restated)

> **No mainnet value moves until the ceremony `vk` is the deployed verifier and the audit
> fix-verification round is green.** Until then: testnet / gated pilot only, labeled
> "pre-ceremony, no real funds."

---

## 8. Checklist (copy into the tracking issue)

```
PRE
[ ] circuit frozen (incl. #8 publicAmount range) + audit soundness fixes merged
[ ] circuit.r1cs regenerated; SHA-256 published; tag cut
[ ] cmd/ceremony built, hashed, published; dry-run by 2 people on throwaway entropy
[ ] ceremony verify wired into CI
[ ] Phase-1 selected, imported, hash pinned (phase1.pinned)
[ ] beacon chosen + announced (drand round / BTC height)
[ ] ≥5 contributors confirmed (incl. 1 air-gapped)

RUN
[ ] init from pinned Phase-1 + frozen r1cs
[ ] contributor 1..N each: verify-in → contribute → destroy secret → sign attestation
[ ] beacon applied as final step
[ ] ceremony verify PASS over full chain

POST
[ ] pk.bin / vk.bin derived
[ ] Groth16Verifier.sol re-exported; provenance_test.go PASS
[ ] SETUP_MANIFEST.md updated (pins, transcripts, attestations, beacon, hashes)
[ ] ShieldedPool + PoolRegistry redeployed on ceremony verifier
[ ] full regression green on redeployed verifier
[ ] transcripts + attestations + one-command verifier published
[ ] mainnet gate lifted ONLY after audit fix-verification round is green
```

---

## 9. Effort & lead time (realistic)
- Tooling build + CI wiring + dry run: ~1–2 weeks eng.
- Contributor scheduling + actual ceremony: ~1–2 weeks wall-clock (people, not compute).
- Re-export + redeploy + regression: ~2–3 days.
- **Critical-path dependency:** the external audit's circuit findings must land first, so the
  ceremony realistically starts only after the audit's first report. Start audit + build
  ceremony tooling **in parallel** to compress the schedule.
