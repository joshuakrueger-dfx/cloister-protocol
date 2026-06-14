# CP2 — Demand validation (gap: no validated paying customer)

Second most likely cause of death (STRESS_TEST §0.2, §2, §10.5). Goal: find out if anyone
pays for payment privacy **before** building more. Target ~15 interviews in 2 weeks.

## Who to interview (target 20, book 15)

- **Persona A — Treasury/CFO of a crypto-native SMB/DAO** (pays suppliers/salaries on-chain).
- **Persona C — PSP/fintech** doing or planning stablecoin settlement (highest-value).
- A few **Persona B** privacy-ideological users (sanity-check, but don't over-weight — low LTV).
- 2–3 **compliance officers / CEX risk** people (the critics — their "no" is decisive).

Source from: DFX/OCP existing merchants, crypto-treasury communities, fintech network.

## Interview script (don't pitch — discover)

1. "Walk me through your last 5 on-chain payments. What's annoying about them?"
2. "Who can see those transactions today? Does that matter to you / your counterparties?"
   *(Listen for spontaneous privacy pain. If they don't raise it — that's a finding.)*
3. "Have you ever changed behaviour because a payment was public?" (new address, CEX, OTC?)
4. "What do you do today to keep payments confidential?" (reveals the real competitor)
5. "If a payment were confidential **but** provably compliant (auditor-friendly), what would
   change for you?"
6. "What would your bank/CEX/auditor say about funds that came out of a privacy pool?"
   *(This question alone may kill or confirm the thesis.)*
7. **Price probe:** "If this saved you X, what would you pay — % of volume, monthly, per-tx?"
8. "Who else has this problem worse than you?"

## Fake-door test (revealed > stated)

One landing page (reuse the website): "Confidential, compliant stablecoin settlement —
request access." Track: visits → email submits → "book a call" clicks. Run small paid
traffic to the two personas. **Metric of truth: qualified booked calls per 100 visits.**

## Kill/keep thresholds (set before running)

- ≥3 of 15 interviewees express a **must-have** pain *and* a concrete willingness-to-pay → **keep**, pursue B2B wedge.
- Privacy raised spontaneously by <2/15 and fake-door conversion ~0 → **demand not validated** → pivot/shelve.
- Compliance/CEX contacts say pool funds get **frozen** → blocker; resolve via OFFRAMP_ACCEPTANCE.md before anything else.
