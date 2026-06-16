# Cloister Protocol

**A universal privacy layer for payments on any EVM chain.** Cloister is a *compliant,
encrypted-UTXO shielded pool* that breaks the on-chain link between a wallet and a payment:
no one — not the merchant, not an on-chain observer, not even the settlement broker — learns
the payer's address or can derive their balances, other wallets, or net worth from it.

Crucially, privacy here is **provable, not opaque**. Every payout carries a zero-knowledge
proof that the funds belong to a compliance good-set (the Association-Set Provider) and
originate from a KYC-verified source — so a user can stay private *and* demonstrate clean
origin to a bank, auditor, or tax authority on demand.

Cloister is **not tied to a single product**. Any wallet, PSP, or payment flow can use the
pool as shared privacy infrastructure. [OpenCryptoPay](https://github.com/openCryptoPay) is
the first integration (see [`docs/en/INTEGRATION.md`](docs/en/INTEGRATION.md)).

> ⚠️ **Status: Proof of Concept — not production-ready.** The ZK layer, contracts, and
> critical paths have passed an adversarial internal audit and are hardened (reentrancy/CEI,
> SafeERC20, scalar binding, and more — see [`docs/en/SECURITY.md`](docs/en/SECURITY.md)).
> **Still open for mainnet:** a real multi-party trusted-setup ceremony and two external audits
> (circuit + contracts). The compliance layer (ASP good-set membership) is already enforced
> inside the circuit and revocable on-chain.

## What the PoC proves

- **Payer privacy.** A payment is spent via a zk-SNARK and broadcast by a **relayer** — the
  payer's address never appears as `tx.from` or in the calldata.
- **Fully shielded payments.** The internal payment moves **no token on-chain** (a payment
  note replaces the transfer); the broker unshields only at settlement.
- **Correctness.** Value conservation, nullifiers (no double-spend), Merkle membership, and
  on-chain Groth16 verification — the books balance across shield → pay → settle.
- **Compliance without disclosure.** An **ASP good-set inclusion proof** attests that funds
  are clean, revealing nothing about history — the basis for the *proof-of-innocence* receipt.
- **Scalable gas.** Off-chain insertion means the contract computes **zero Poseidon hashes
  on-chain** — the Merkle-root transition is proven in the circuit instead of running ~40
  Poseidon hashes per insert on-chain. This is a *design* reduction (verify-only vs. naive
  on-chain `_insert`); cite exact figures from a `hardhat-gas-reporter` run, not from prose.
- **Fast note discovery.** An indexer plus view-tags filter foreign notes without full decrypt.
- **Parallel throughput.** `numLanes` independent roots let payments in different lanes land
  in the same block; only same-lane spends serialize.

## How it works

The zero-knowledge layer is **self-built on [gnark](https://github.com/Consensys/gnark)**
(Apache-2.0). The **shipped product** — the on-device prover binary and the app — contains no
GPL/LGPL/copyleft code (verified by `go list -deps ./mobile`). LGPL go-ethereum is confined to
developer-only CLI tooling that is never distributed. See [`docs/LICENSES.md`](docs/LICENSES.md)
and [`docs/LICENSE_AUDIT.md`](docs/LICENSE_AUDIT.md).

- **Groth16 / BN254**, **Poseidon2**, a 2-in / 2-out transaction circuit, **50,481 constraints**.
- Proving runs **on-device in ~190–220 ms** (≈ 8× faster than the superseded circom/snarkjs
  WebView path). The witness never leaves the device.
- The relayer is **broadcast-only**: it pays gas and submits, but cannot see or alter the
  payment.

For the full design — transaction lifecycle, the public signals, the soundness argument, and
the trust boundaries — read [`docs/en/ARCHITECTURE.md`](docs/en/ARCHITECTURE.md) and
[`docs/en/CIRCUIT.md`](docs/en/CIRCUIT.md).

## Architecture (monorepo)

| Package | Contents |
|---|---|
| `packages/prover-gnark` | The ZK system in Go: Poseidon2 + Groth16 circuit, proving keys, the on-device prover (`mobile/`), and a dev proving daemon (`proverd`) |
| `packages/contracts` | `ShieldedPool` (off-chain insertion + lane parallelism), the generated Groth16 verifier, the registry, and a mock USDC (Hardhat) |
| `packages/sdk` | Curve-free keys, notes, Merkle tree, note encryption (nacl) + view-tags, proof generation, chain/indexer sync, and the OCP client |
| `packages/api` | Mock OpenCryptoPay provider + broadcast-only relayer + ASP (the "shielded methods" endpoints) |
| `packages/indexer` | Commitment indexer with view-tags for fast note discovery |
| `apps/web` | **Cloister Console** — the operator front-end (Vite + React + TypeScript) |
| `apps/demo` | End-to-end demos (direct, over the HTTP API, and with the indexer / view-tags) |

## Cloister Console (`apps/web`)

The console is the human-facing surface: a self-custody, KYC-gated treasury app for private,
compliant disbursements. It covers the full operator journey —

- **Onboarding** — create or import a seed, set a vault password, complete one-time KYC +
  sanctions screening, and (optionally) link a DFX account.
- **Overview** — shielded balance, anonymity-set health per chain, and live compliance status.
- **Fund** — the single public touchpoint; after funding, the link to the deposit is broken.
- **Disburse** — single, batch, and recurring (payroll / programmatic) private payouts, each
  with a live proving console.
- **Recipients · Activity** — viewing-key-decrypted directory and ledger, visible only to you.
- **Compliance Center** — generate proof-of-innocence receipts and grant scoped, time-limited
  viewing-key disclosures to auditors, banks, and tax authorities.

It ships with a **Demo backend** (mock data, no infrastructure required) so the entire flow
is explorable offline, and a **Local backend** that drives the real stack.

## Requirements

- **Node ≥ 20** and **pnpm**
- **Go ≥ 1.21** — only for the gnark prover / `proverd` (the Demo console needs no Go)

## Setup

```bash
pnpm install
```

## Run

**Just the console (Demo backend — no infrastructure):**

```bash
pnpm app          # Vite dev server → http://localhost:5180
```

Open the app, complete onboarding, and the "Demo" backend serves realistic mock data end to
end.

**The full local stack (real proofs, devnet, relayer, indexer, console):**

```bash
pnpm dev:stack    # Hardhat devnet → gnark proverd → provider/relayer/ASP → indexer → web
```

Then open <http://localhost:5180> and switch the backend to **Local**. A single `Ctrl-C`
tears the whole stack down; logs land in `$TMPDIR/cloister-*.log`.

**Demos and measurements.** The scripted CLI demos under `apps/demo/` predate the circom→gnark
migration and are being ported to the native prover (they referenced the removed snarkjs
`artifactPaths`); they are intentionally not wired into `package.json` yet. Until then, the
real, verified end-to-end path is the contracts test suite (`pnpm --filter @cloister/contracts test`,
incl. the gnark real-proof deposit E2E) and the prover-gnark Go tests. Gas figures should be cited
only from a `hardhat-gas-reporter` run, not from the legacy demo script.

## Documentation

The **English, as-built** documentation lives in [`docs/en/`](docs/en/) and is the source of
truth for the gnark system:

| Document | What it covers |
|---|---|
| [`docs/en/ARCHITECTURE.md`](docs/en/ARCHITECTURE.md) | System, components, transaction lifecycle, key design decisions |
| [`docs/en/CIRCUIT.md`](docs/en/CIRCUIT.md) | The ZK contract: primitives, public signals, constraints, soundness |
| [`docs/en/SECURITY.md`](docs/en/SECURITY.md) | Threat model, contract/circuit/relayer controls, residual risks |
| [`docs/en/PRIVACY.md`](docs/en/PRIVACY.md) | What is hidden vs revealed, proving location, trust boundaries |
| [`docs/en/FALLBACKS.md`](docs/en/FALLBACKS.md) | Proving / submission / sync fallback chains and idempotency |
| [`docs/en/INTEGRATION.md`](docs/en/INTEGRATION.md) | Wiring the prover, SDK, relayer/indexer, and deployment |
| [`docs/en/VALIDATION.md`](docs/en/VALIDATION.md) | Test suites, the 1000-transaction soak, the adversarial battery, results |

`docs/en/llms.txt` is a compact, machine-readable index of the whole system. The German
`docs/*.md` are the original design-phase documents and may reference the superseded circom
design.

## Limits & next steps

Deliberately **out of scope** for the PoC — external gates, not code problems:

- **External security audits** of the circuit and contracts — mandatory before real funds.
- **A production trusted setup** (multi-party ceremony) instead of the local single contributor.
- **Compliance — remaining pieces.** ASP association-set membership **is** enforced inside the
  circuit today (every real input proves membership in the ASP good-set root) and roots are
  revocable on-chain. Still designed-but-not-enforced: Level-3 selective viewing-key disclosure.
- **Mainnet deployment** — the target is the major L2s (Polygon / Base / Arbitrum), not L1.

The prioritized blocker list for productization lives in
[`docs/PRODUCTION_READINESS.md`](docs/PRODUCTION_READINESS.md).

## License

MIT for this repository's code. The ZK layer is built on gnark (Apache-2.0); the shipped
product is GPL/LGPL-free (LGPL go-ethereum is confined to non-distributed dev CLIs). See [`docs/LICENSES.md`](docs/LICENSES.md) and
[`docs/LICENSE_AUDIT.md`](docs/LICENSE_AUDIT.md).
