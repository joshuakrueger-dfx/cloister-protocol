# Viewing keys & disclosure

Privacy that cannot be selectively lifted is useless to a regulated business — you must be able to
prove your own history to a bank, auditor or tax authority. Cloister solves this with **viewing
keys**: cryptographic keys that grant **read-only**, **scoped** visibility into transactions,
without ever granting the ability to spend.

## Two kinds of keys

Cloister separates the power to *spend* from the power to *see*:

- **Spend key** — authorizes payments. Required to move funds. Never shared.
- **Viewing key** — decrypts the memos of transactions in its scope, revealing amounts and
  counterparties. Can be shared with an auditor. **Cannot spend anything.**

Both derive deterministically from one seed (see [Keys & recovery](concept-keys.html)), so a
single backup recovers everything, and a viewing key can be handed over without exposing the spend
key.

## How disclosure works

Each output note carries an **encrypted memo** (a `nacl box`, x25519) describing the note —
amount, blinding, ownership — readable only by holders of the matching viewing key. To disclose:

1. The owner derives a viewing key scoped to what needs revealing (e.g. all of their own
   transactions, or a specific subset).
2. They hand that key to the auditor.
3. The auditor uses it to decrypt exactly those memos — seeing the real amounts and counterparties
   — and **nothing else**. They cannot spend, and they cannot see transactions outside the scope.

Because the disclosed data is cryptographically tied to the on-chain commitments, the auditor can
verify it is **genuine and complete** for that scope — the owner cannot show a doctored subset.

## View tags — discovery without scanning

Memos also carry a 1-byte **view tag**. A wallet checks the tag first and rejects ~255 of every
256 notes that are not its own **without decrypting them**. Only the rare candidate is decrypted.
This means:

- Discovering your incoming payments is **fast** and scales with pool size.
- Your scanning cost does not leak *which* notes are yours.

## Selective, not all-or-nothing

The point of viewing keys is **granularity**. Disclosure is a key you choose to hand over, scoped
to a purpose:

| Scenario | What you disclose | What stays private |
|---|---|---|
| Tax filing | your own full history for a period | everyone else's everything |
| Bank source-of-funds check | the trail of the funds in question | your unrelated balances/payments |
| Internal DAO audit | the treasury's transactions | members' personal wallets |
| Day-to-day | nothing | everything |

You are never forced into all-or-nothing transparency. The default is privacy; disclosure is
deliberate, scoped and revocable in practice (you simply don't re-share, and you can rotate keys).

## What a viewing key cannot do

- It **cannot spend** — it is read-only by construction.
- It **cannot widen its own scope** — it decrypts only memos it was derived to cover.
- It **cannot forge** — disclosed data is verifiable against on-chain commitments.

## Trust boundary recap

| Party | With a viewing key, sees | Never gets |
|---|---|---|
| You (owner) | everything you own | — |
| Authorized auditor | exactly the scoped history | spend power; out-of-scope data |
| Anyone without the key | opaque commitments only | amounts, counterparties, balances |

Next: [Keys & recovery](concept-keys.html) — where these keys come from.
