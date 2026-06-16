# Cloister — Documentation (English, as-built)

Cloister is a compliant, encrypted-UTXO **shielded pool** for EVM chains — a privacy layer
for payments. A payer settles without revealing the on-chain link between their funds and
the recipient, while proving in zero knowledge that the funds belong to a compliance
good-set (the Association-Set-Provider). It is a standalone DFX product; OpenCryptoPay is
the first integration.

This folder documents the **as-built gnark system**. The German `docs/*.md` are the
design-phase documents (and may reference the superseded circom design).

## Read in this order

1. **[ARCHITECTURE.md](ARCHITECTURE.md)** — the system, components, transaction lifecycle,
   and the key design decisions (gnark, Poseidon2, curve-free keys, off-chain insertion,
   lanes, ASP, on-device proving, broadcast-only relayer).
2. **[CIRCUIT.md](CIRCUIT.md)** — the ZK contract: primitives, the 10 public signals, every
   enforced constraint, the soundness argument, and the trusted-setup caveat.
3. **[SECURITY.md](SECURITY.md)** — threat model and the contract / circuit / relayer
   controls; defense-in-depth; residual risks for mainnet.
4. **[PRIVACY.md](PRIVACY.md)** — what is hidden vs revealed, where proving happens, note
   discovery, and the trust boundaries per party.
5. **[FALLBACKS.md](FALLBACKS.md)** — the proving / submission / sync fallback chains and
   the idempotency guarantee ("never hang, never double-submit").
6. **[INTEGRATION.md](INTEGRATION.md)** — wiring the native prover, the SDK, build/prove/
   submit, the relayer/indexer, and deployment.
7. **[VALIDATION.md](VALIDATION.md)** — every test suite, the 1000-transaction soak, the
   adversarial battery, and the measured results.

`llms.txt` is a compact machine-readable index of the whole system for LLM consumption.

## TL;DR for engineers

- Self-built ZK on **gnark** (Apache-2). Shipped product is GPL/LGPL-free; LGPL go-ethereum is confined to non-distributed dev CLIs (see `../LICENSES.md`).
- **Groth16/BN254**, **Poseidon2**, 2-in/2-out, **50,481 constraints**.
- Prove **~190–220 ms** (≈ 8× the old circom/snarkjs WebView path).
- Proving is **on-device**; the relayer is **broadcast-only**; the witness never leaves the phone.
- Compliance via an **ASP good-set inclusion proof** — privacy *and* clean-funds attestation.
