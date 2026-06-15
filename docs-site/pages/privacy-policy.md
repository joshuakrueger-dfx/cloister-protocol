# Privacy policy

This policy explains how the **Cloister Protocol documentation site** and reference applications
handle data. It is distinct from the protocol's *privacy model* (what the chain reveals), which is
documented under [Privacy model](privacy.html).

> This is a Proof-of-Concept project by **DFX AG**. This page describes current practice for the
> documentation and demo surfaces and will be expanded into a full legal privacy notice ahead of any
> production launch.

## This documentation site

The docs site (`docs.cloister-protocol.com`) is a set of **static pages**. It does not require an
account, does not run third-party advertising or cross-site trackers, and does not sell data. Basic
server/CDN logs (e.g. IP address, user agent, requested path) may be processed transiently to serve
content and protect against abuse, as is standard for any web host.

## The reference Console (app)

The reference web application at `app.cloister-protocol.com` is **self-custodial**:

- **Keys and proving stay with you.** Private keys, amounts, balances and the proving *witness* are
  handled on your device and are **never** transmitted to Cloister servers. See
  [Keys & recovery](concept-keys.html).
- **Relayer.** When you submit a payment, the relayer receives only the finished zero-knowledge
  proof and public calldata — never your keys or witness. See [Private payments](concept-pay.html).
- **On-ramp / KYC.** If you use an integrated on-ramp (e.g. DFX) to acquire funds, that provider
  performs KYC and processes your identity data under **its own** privacy policy and as the relevant
  data controller. Cloister does not receive or store that KYC data.
- **Demo mode.** The Console's demo backend uses **sample data** and test tokens; no real funds or
  personal data are involved.

## On-chain data

Transactions you make on a blockchain are, by nature, **public and permanent**. Cloister minimises
what is exposed (see [Privacy model](privacy.html)), but the existence of shielded transactions and
the amounts crossing the pool boundary for deposits/withdrawals are visible on-chain and cannot be
deleted. Consider this before transacting.

## Your choices

Because the protocol is self-custodial and the docs site is static, there is no account to delete
and no profile held about you here. For data processed by an integrated on-ramp/KYC provider, exercise
your rights with **that provider** directly.

## Contact

Questions about this policy or data handling: **DFX AG**, Switzerland — see the
[Imprint](imprint.html) for contact details. This policy may be updated as the project moves toward
production.
