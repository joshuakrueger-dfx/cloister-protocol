# Concept — ASP decentralization + attestation (fills the ASP-liability gap)

**Why:** the Association-Set-Provider curates the "good set." A single ASP is a trust + AML
liability concentrator (STRESS_TEST §0.5, §10.11) and, run by DFX, may make DFX a regulated
gatekeeper. It is also the moat (compliant privacy) — so it must be designed, not avoided.

## Design

- **Monotone good-set, multiple roots.** The ASP publishes `associationRoot`s; the contract
  accepts any `knownAspRoot`. The set only grows, so old roots stay valid — no races, and a
  proof against an older (smaller) good set is still "clean" (subset of a newer one). Already
  implemented on-chain.
- **Multi-ASP.** Allow several independent ASPs (different jurisdictions/policies). A pool
  can accept roots from a set of ASPs; wallets prove inclusion in whichever ASP their
  off-ramp/regulator recognizes. Reduces single-point trust and lets the market pick.
- **Attestation as the product.** The ASP issues a signed, off-ramp-consumable attestation
  (see validation/OFFRAMP_ACCEPTANCE.md): {claim, associationRoot, ASP entity+licence,
  timestamp, signature}. This is what turns "privacy" into "compliant privacy."
- **Transparency.** ASP root updates are on-chain events (`AspRootPublished`); the inclusion
  policy + entity are public. Inclusion is provable; exclusion (bad-set) is the ASP's policy.
- **Governance.** ASP key + the pool's `asp` role and `PoolRegistry` owner must be
  **multisig + timelock** in production (already noted in SECURITY).

## Liability posture (for counsel — see LEGAL_QUESTIONS.md)

The ASP makes a positive compliance claim; that is the regulated surface. Options: DFX runs
it under its existing licence; or a separate licensed entity; or third-party ASPs. The
legal opinion decides which is viable — this concept keeps all three open.

## Open question (flag)

Whether an inclusion-only good-set is sufficient for regulators, or whether
exclusion/bad-set + travel-rule data is required, is **unresolved** and is a top question
for counsel. Do not assume inclusion-proofs satisfy AMLR.
