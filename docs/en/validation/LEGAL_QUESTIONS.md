# CP2 — Legal validation (gap: no legal classification)

The single most likely cause of death (see STRESS_TEST §0.1, §10.1–3). Resolve **before**
further engineering spend. This is an instrument for counsel, not legal advice.

## Engage

Two crypto-regulatory firms in the primary jurisdiction (DFX = Switzerland; EU as second).
Scope a paid pre-opinion (a few k€) — cheap relative to a wrong build.

## The questions that decide go/no-go

1. **Classification.** Is a non-custodial, ASP-gated shielded pool a regulated activity
   (VASP/CASP under MiCA, money transmitter, "anonymising service") in CH and the EU? Does
   the protocol being *immutable + non-custodial* change the answer?
2. **AMLR (EU, ~2027).** Does the draft Anti-Money-Laundering Regulation's restriction on
   "anonymity-enhancing" instruments/accounts capture Cloister? Does ASP inclusion-proof
   compliance exempt it, or is any unlinkability fatal?
3. **Developer/operator liability.** Given *Tornado Cash* (OFAC sanction), *Pertsev* (NL
   conviction), *Storm* (US trial): what conduct (deploying, relaying, running the ASP,
   marketing) creates personal/corporate criminal exposure? Does running the **ASP** make
   DFX a regulated gatekeeper?
4. **Relayer.** Does operating/paying the broadcast relayer constitute money transmission?
5. **Travel Rule.** Where do FATF Travel-Rule obligations attach in a shielded transfer,
   and can the ASP attestation satisfy them?
6. **Off-ramp.** Are CH/EU CEXs/banks legally permitted to accept pool-withdrawn funds with
   an ASP attestation, and what attestation format would satisfy their compliance teams?
7. **Marketing.** Can we lawfully market "privacy" for payments in CH/EU, or must framing be
   strictly "confidentiality + compliance"?
8. **Jurisdiction structuring.** Is there a viable structure (entity location, no-US-nexus,
   chain choice) that materially lowers risk?

## Jurisdiction matrix (to fill with counsel)

| Jurisdiction | Classification | Operator licence needed? | Dev liability risk | Off-ramp acceptance | Verdict |
|--------------|----------------|--------------------------|--------------------|---------------------|---------|
| Switzerland | ? | ? | ? | ? | ? |
| EU (MiCA/AMLR) | ? | ? | ? | ? | ? |
| US | ? (likely hostile) | ? | High (precedent) | ? | likely avoid |

## Decision gate

- **Green** (survivable path exists in ≥1 target jurisdiction) → proceed to audit + ceremony.
- **Amber** (only B2B-licensed/permissioned model works) → pivot per WEDGE.md.
- **Red** (no lawful distribution) → shelve the consumer product; salvage tech as licensed
  infra or research.
