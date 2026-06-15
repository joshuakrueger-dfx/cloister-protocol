# Cloister Protocol

> A compliant privacy layer for stablecoin payments on any EVM chain — by **DFX AG** (Switzerland).

Public blockchains are radically transparent. Every stablecoin transfer permanently exposes
the sender, the receiver, the amount, and — through that address — the sender's entire balance
and transaction history to anyone in the world. For a salary, an invoice, a supplier payment or
a treasury transfer, that is unacceptable. It is the equivalent of every bank wire being printed
in tomorrow's newspaper, forever.

Cloister fixes this. It is a **shielded payment pool** that breaks the on-chain link between a
wallet and a payment. After funds enter the pool, nobody — not the merchant, not an on-chain
observer, not even the relayer that broadcasts the transaction — learns the payer's address or
can derive their balances and net worth from it.

## Privacy *with* accountability — not a mixer

The hard part is doing this **without** becoming a money-laundering tool. Anonymous mixers solve
privacy and ignore compliance; that is why they get sanctioned and why no regulated business can
touch them. Cloister takes the opposite stance:

- Funds may only enter the pool through a **screened, KYC-verified** on-ramp. The entry point is
  the one public touchpoint, and it is gated.
- Every private payout carries a **zero-knowledge proof** that the spent funds belong to a
  curated compliance good-set (the *Association-Set-Provider*, ASP) — proving the money is clean
  **without revealing which deposit it came from**.
- **Viewing keys** let the owner — or an authorized auditor, bank or tax authority — selectively
  reveal a specific transaction history on demand, while everything else stays private.

So a user can stay private **and** demonstrate clean origin to a regulator. That is the whole
point: *privacy is the default, disclosure is a key you hold.* This is what makes Cloister a
product a regulated Swiss company can ship.

## What it is, in one paragraph

You shield funds into the pool once (public, screened). From then on your balance lives as an
**encrypted commitment** — a hash that reveals nothing. To pay, your device builds a
**zk-SNARK** that proves you own enough clean funds and authorizes the transfer; a
**broadcast-only relayer** submits it and pays the gas, so your address never appears on-chain.
The recipient discovers their incoming note privately. No address link, no visible amount, no
leaked balance — but a provable, auditable clean-origin trail underneath.

## At a glance

- **Privacy by default** — the payer's address never appears as the transaction sender or in calldata.
- **Compliance by design** — only screened funds are admitted; viewing keys give authorized auditors selective, time-bounded disclosure.
- **Any EVM chain** — identical contracts and once-compiled circuits deploy to any EVM L2 (Base, Polygon, Arbitrum, …).
- **Self-custodial** — proving happens on your device; private keys, amounts and balances never leave it.
- **~5× cheaper** — off-chain Merkle insertion brings a shielded payment to ≈350k gas instead of ≈1.74M.
- **Built for builders** — an open, additive HTTP API + SDK; any wallet or PSP can integrate, with no lock-in.

## Where to start

| If you want to… | Read |
|---|---|
| Understand the payment in four steps | **[How it works](how-it-works.html)** |
| See concrete use cases | **[Why Cloister](why-cloister.html)** |
| Understand the moving parts | **[The shielded pool](concept-pool.html)** and the Core concepts section |
| Read the deep design | **[Architecture](architecture.html)** and the **[Circuit specification](circuit.html)** |
| Integrate it | **[Integration guide](integration.html)** |
| Just get answers | **[FAQ](faq.html)** and **[Glossary](glossary.html)** |

> **Status — Proof of Concept.** The contracts and circuit were hardened in an internal
> adversarial audit. External audits and a production multi-party trusted-setup ceremony are
> still pending before any mainnet deployment. See the **[Disclaimer](disclaimer.html)**.
