# Association sets & compliance

This is the page that separates Cloister from a mixer. An **association set** (or compliance
good-set) is the curated set of deposits known to be clean. Every private payment proves its funds
belong to that set — **without revealing which member** — so the protocol delivers privacy *and*
provable clean origin at the same time.

## The idea

When you deposit through a screened on-ramp ([Shielding funds](concept-shield.html)), your deposit
is added to the **good-set** maintained by an **Association-Set-Provider (ASP)**. The good-set is
itself a Merkle tree, summarised by an **Association root** stored in the pool.

When you later spend a note, the circuit requires you to prove — in zero knowledge — that the note
you are spending descends from a deposit **inside** that good-set. Concretely, for every real
input the circuit enforces:

```
climb(C, assocIndex, assocPath) == AssociationRoot
```

i.e. the input's commitment is a leaf under the compliance root. If the funds are not in the
good-set, **no valid proof exists** — the payment cannot be made.

## "Proof of innocence", not "proof of identity"

The crucial property: the proof shows membership **without revealing which member**. An observer —
or the ASP itself — learns only that the spent funds are *somewhere* in the clean set, not which
deposit, not whose, not how much.

This is sometimes called a **proof of innocence**: you demonstrate your money is not in the "bad"
set, without deanonymising yourself. Compare this to the two failure modes Cloister avoids:

| Approach | Privacy | Compliance |
|---|---|---|
| Transparent chain | none | trivial, but no privacy |
| Anonymous mixer | full | none — unknown origin |
| **Cloister association set** | full | provable clean origin |

## Why the set only grows

The good-set is **monotonic** — deposits are only ever added, never removed. This has two
practical benefits:

- **Old roots stay valid.** A proof built against last week's Association root is still accepted,
  so root updates do not invalidate proofs that are already in flight.
- **No races.** A user proving membership does not race the ASP adding a new member; both can
  happen concurrently without conflict.

(If a deposit must be excluded after the fact — e.g. a screening reversal — that is handled by
policy at the ASP and forward-looking root management, not by silently breaking existing proofs.)

## Who runs the ASP

The ASP defines and curates the compliance policy — which screened deposits enter the good-set. In
the reference design a regulated operator runs it, applying the same KYC/AML standards as its
on-ramp. Importantly, the ASP's power is **bounded**:

| The ASP **can** | The ASP **cannot** |
|---|---|
| decide which deposits are admitted to the good-set | spend your notes |
| define compliance policy | deanonymise you from on-chain data |
| publish updated good-set roots | see your balance or who you pay |

The ASP curates eligibility; it never holds funds and never sees the private graph.

## How this satisfies a regulator

A regulated entity needs to answer "where did this money come from?". Cloister answers it on two
levels:

1. **Systemically** — every payout in the system carries a good-set membership proof, so the pool
   as a whole cannot be funded by unscreened money.
2. **Specifically** — for an individual audit, [viewing keys](concept-viewing-keys.html) let the
   owner or an authorized auditor reveal a precise transaction trail on demand.

Together these mean a user can be fully private day-to-day and still produce a clean, auditable
origin story when legitimately required.

Next: [Viewing keys & disclosure](concept-viewing-keys.html).
