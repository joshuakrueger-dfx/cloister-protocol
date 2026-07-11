# Security policy

Cloister is a proof-of-concept and must not be used with real value until the published
multi-party setup, independent circuit/contract audits, and production operations gates are
complete.

## Reporting a vulnerability

Please do not open a public issue for a suspected fund-loss, soundness, key-compromise, or
privacy vulnerability. Use a private GitHub Security Advisory for this repository or contact
`security@dfx.swiss` with:

- affected commit and component;
- a minimal reproduction or proof of concept;
- impact and exploit preconditions;
- whether the finding is already public.

We will acknowledge reports within seven days, coordinate a fix and disclosure timeline with the
reporter, and publish a post-mortem for confirmed high-impact issues after affected deployments
are contained.

## Scope

In scope: contracts, circuit, proving/verifying-key provenance, SDK cryptography, wallet key
handling, relayer/indexer authorization and consistency, and release/licensing supply chain.

The current testnet deployment and all single-party setup keys are explicitly non-production.
