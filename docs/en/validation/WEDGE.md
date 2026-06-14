# CP2 — Wedge decision (gap: product vs. feature)

The current build optimizes "consumer pays a merchant privately via OCP." The panel's read
(STRESS_TEST §3, §6, §12) is that the **paying** customer is B2B, not that consumer flow.
This memo forces the choice.

## Three candidate wedges

| Wedge | Buyer | Why it pays | Risk | Panel view |
|-------|-------|-------------|------|------------|
| **W1 Consumer pay-at-merchant** (current) | end user / merchant | privacy at checkout | consumers don't pay for privacy; weakest demand; highest regulatory visibility | weakest |
| **W2 Treasury/SMB confidential payments** | crypto-native CFO/DAO | hide vendor/salary flows; auditor-friendly | needs off-ramp acceptance; medium sales | viable |
| **W3 Compliant-confidential settlement infra for PSPs/banks** | fintech/PSP/DFX itself | confidential settlement **with** an audit trail; licensable | long sales cycle; needs legal clarity | **strongest / most defensible** |

## Recommendation (conditional on CP2 results)

Lead with **W3, with DFX as the first reference customer**, and W2 as the self-serve tier.
Treat **W1 (the OCP consumer demo) as a marketing showcase, not the business.** Rationale:
W3 has real willingness-to-pay, the compliance story is a feature not a liability, the moat
is distribution+licence+attestations (copy-resistant), and it survives a stricter
regulatory reading better than anonymous consumer payments.

## What changes if we pick W3

- Productize the **ASP attestation** (OFFRAMP_ACCEPTANCE.md) as the headline feature.
- Package as an **SDK + audited contracts + ASP service** sold/licensed, not a consumer app.
- KPIs shift to: signed design partners, settlement volume, attestations accepted by off-ramps.
- The current wallet integration becomes a *reference implementation*, not the GTM.

## Decision rule

Pick the wedge **after** CP2 interviews + legal: choose the highest-WTP segment that the
legal opinion says is lawful in a target jurisdiction. Do not build W1-specific features
until W1 demand is proven (it likely won't be).
