# CP2 — Off-ramp acceptance (gap: can pool funds be spent?)

If CH/EU CEXs/banks freeze funds that came out of a privacy pool, the product's output is
unspendable and nothing else matters (STRESS_TEST §0.10, §10.4). Cheap to test.

## Test protocol (small real money, one chain)

1. Deposit a small amount of USDC into the (testnet first, then a tiny mainnet) pool.
2. Withdraw to a fresh address.
3. Deposit that USDC into a CH/EU CEX account (e.g. one DFX already integrates).
4. Observe: accepted / flagged / frozen / questioned. Record the exact compliance response.
5. Repeat **with an ASP attestation attached** (see handshake below) and compare.

## ASP-attestation handshake (the compliance bridge)

The differentiator vs. Tornado is that Cloister can *prove clean origin*. Design the
attestation so a CEX/bank compliance team can consume it:

- **Claim**: "the withdrawn amount derives only from deposits in ASP good-set root R, which
  the ASP (named legal entity) attests excludes sanctioned/illicit sources as of date D."
- **Form**: a signed statement (ASP key) binding {withdrawal nullifier(s) or recipient,
  associationRoot R, timestamp, ASP entity + licence ref}. Optionally a zk proof the
  CEX can verify, or a simple signed JSON the compliance team accepts off-chain.
- **Delivery**: the wallet hands the attestation to the CEX at deposit time (paste/upload),
  or the CEX queries an ASP attestation endpoint by reference.

## Questions for DFX compliance (internal, free, fast)

1. Would DFX's own off-ramp accept pool-withdrawn USDC today? With/without attestation?
2. What attestation content would make it acceptable?
3. Which chain-analytics vendor (Chainalysis/Elliptic/TRM) does DFX rely on, and how would
   it label pool-touched funds? Can the ASP be whitelisted with them?

## Gate

- Accepted (with attestation) at ≥1 real off-ramp → **the compliance thesis holds**; this is
  the moat. Build the attestation into the product as a first-class feature.
- Frozen even with attestation → **existential**; do not launch consumer flow until the
  attestation is pre-accepted by partner off-ramps.
