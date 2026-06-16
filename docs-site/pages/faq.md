# Frequently asked questions

## What is Cloister Protocol?

A compliant privacy layer for stablecoin payments on EVM chains.
It is a shielded pool that hides the payer's address, the amount and the payer↔recipient link,
while still proving — in zero knowledge — that the funds are clean. See the
[Introduction](index.html).

## Is this a mixer?

No. A mixer accepts funds of **unknown origin**; that is what gets mixers sanctioned. Cloister
admits funds **only** through a KYC-verified, sanctions-screened on-ramp, and every payout proves
membership in a compliance good-set. Privacy comes with provable clean origin and selective
auditability. See [Why Cloister](why-cloister.html) and
[Association sets & compliance](concept-association.html).

## How is it private if the blockchain is public?

Inside the pool, value is held as **commitments** (hashes), not balances, and spending reveals only
an unlinkable **nullifier**. A zero-knowledge proof authorizes each payment without revealing the
amounts, owners, or which note funded which output. A **relayer** submits the transaction and pays
gas, so your address is never the on-chain sender. See [How it works](how-it-works.html).

## What can an outside observer actually see?

That *a* shielded transaction happened, plus opaque commitments and nullifiers. For deposits and
withdrawals, the amount crossing the pool boundary is visible (tokens move). Internal payments move
no tokens, so their amounts are fully hidden. Observers cannot see the payer, the recipient, the
link between them, or anyone's balance. See [Privacy model](privacy.html).

## Can a regulator or auditor still check my funds?

Yes — that is a core feature. **Viewing keys** give read-only, scoped disclosure: you (or an
authorized auditor) can reveal a specific transaction history without exposing anything else, and
without granting any ability to spend. See [Viewing keys & disclosure](concept-viewing-keys.html).

## Who controls my money?

You do. Cloister is **self-custodial** — keys derive from your own seed phrase, and proving happens
**on your device**. There is no custodian and no backdoor. See [Keys & recovery](concept-keys.html).

## Does the relayer or the ASP see my private data?

No. The **relayer** only ever receives the finished proof and public calldata — never the witness,
never your keys. The **ASP** curates which screened deposits are in the good-set; it never holds
funds and cannot deanonymise you. See the trust-boundary table in [Privacy model](privacy.html).

## Can the relayer steal or redirect my payment?

No. The recipient, fee and amounts are bound into the proof via `ExtDataHash`; changing any of them
invalidates the proof. The relayer can only broadcast or refuse. If relayers censor, an opt-in
direct-RPC fallback exists (off by default; it trades away sender privacy for liveness). See
[Fallbacks & resilience](fallbacks.html).

## Which chains and assets are supported?

Any EVM chain — the same contracts and once-compiled circuit deploy to any EVM L2. The reference
deployments target **Base, Polygon and Arbitrum** with USDC. A `PoolRegistry` resolves the
canonical pool per `chainId + asset`. See [Deployment](deployment.html).

## How much does a payment cost?

About **350k gas** per shielded payment, versus ≈1.74M for a naive on-chain Merkle insertion —
roughly **5× cheaper**. The saving comes from proving the Merkle update inside the circuit so the
contract does no hashing. See [The shielded pool](concept-pool.html#off-chain-merkle-insertion).

## How fast is proving, and does it work offline?

The native on-device prover produces a proof in **sub-second** time. Because proving is local, it
works **offline** — you only need connectivity to submit the finished proof. See
[Architecture](architecture.html).

## What technology is under the hood?

A self-built zero-knowledge layer on **gnark / gnark-crypto** (Groth16 over BN254), **Poseidon2**
hashing, a fixed-depth (2²⁰) Merkle tree, and **curve-free** keys (`pubKey = H(privKey)`). The
circuit is 50,481 R1CS constraints. See the [Circuit specification](circuit.html).

## Why gnark and not circom/snarkjs?

Licensing and speed. gnark's dependencies are Apache-2 (no GPL entanglement), and the native prover
is roughly **8× faster** than a WebView snarkjs prover. Cloister's ZK layer was rebuilt GPL-free for
exactly this reason. See [Architecture → key design decisions](architecture.html#key-design-decisions).

## Is it audited / production-ready?

It is a **Proof of Concept**. The contracts and circuit passed an internal adversarial audit, but
**external audits and a multi-party trusted-setup ceremony are required before mainnet**. Do not use
it with real funds yet. See the [Disclaimer](disclaimer.html).

## How do I integrate it into my wallet or PSP?

Through an additive HTTP API + SDK — no lock-in, no change to how you custody funds. OpenCryptoPay
is the first integration. Start with the [Integration guide](integration.html).

## What happens if I lose my device?

Restore your **seed phrase** on a new device; the wallet re-derives every key, re-scans the chain
and rebuilds your notes and balance. Lose the seed and — as with any self-custodial wallet — there
is no recovery. See [Keys & recovery](concept-keys.html).

## Who is behind Cloister?

Cloister is an independent, compliance-minded privacy protocol. OpenCryptoPay is its first
integration, but the protocol is payment-rail agnostic. See the [Imprint](imprint.html).
