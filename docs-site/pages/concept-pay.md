# Private payments

A private payment moves value **inside** the pool from one set of notes to another, without
revealing the payer, the amount, or the link to the recipient. This page traces exactly how one
works and why each piece is needed.

## The shape of a payment

Every Cloister payment is a **2-in / 2-out** transaction:

- **Inputs:** up to two of your existing notes (a smaller payment uses one real note and one
  zero-value *dummy*).
- **Outputs:** exactly two new notes — one for the **recipient**, one **change** note back to you.

Value is conserved: `Σ inputs = Σ outputs + externalAmount + fee`. For an internal transfer the
external amount is zero, so **no tokens move on-chain** — only commitments and nullifiers change,
and the amount is fully hidden.

## Step by step

Take **Alice pays Bob 1,000 USDC** from a 5,000-USDC note:

1. **Build the witness.** Alice's wallet gathers the private data: her note's amount, key and
   blinding, its Merkle path, the recipient key, and the split (1,000 to Bob, 4,000 change). This
   is the *witness* — and it **never leaves her device**.
2. **Prove on-device.** The native prover produces a Groth16 **zk-SNARK** (sub-second) that
   attests to everything below in zero knowledge:
   - the input note exists under the current Merkle `Root` (membership),
   - it belongs to the compliance good-set (`AssociationRoot`),
   - the value balances,
   - the input's **nullifier** is correctly derived (so it can be spent once),
   - the two output commitments are correctly formed,
   - and the Merkle root advances correctly (off-chain insertion).
3. **Submit via a relayer.** The wallet sends the finished proof + calldata to a
   **broadcast-only relayer**. The relayer pays gas and is `msg.sender`, so **Alice's address
   never appears.** It only ever sees the public proof — never the witness.
4. **Verify & settle.** The pool contract re-derives the public signals, runs the verifier, and on
   success: records the input nullifier as spent, emits the two new commitments, and advances the
   lane root.
5. **Recipient discovers.** Each output carries an encrypted memo with a **view tag**; Bob's
   wallet finds his 1,000-USDC note (see [Viewing keys & disclosure](concept-viewing-keys.html)),
   and Alice's wallet picks up the 4,000-USDC change note.

## What an observer sees

To anyone watching the chain, the payment is: *a shielded transaction happened.* Two opaque
commitments appeared, one opaque nullifier was spent. No payer, no recipient, no amount, no
balance — and no way to link this to Alice's earlier deposit.

| Hidden | Visible |
|---|---|
| which input funded which output | that *a* shielded tx occurred |
| note amounts, owners | the new (opaque) commitments |
| payer ↔ recipient link | the spent (opaque) nullifiers |
| your balance | net token in/out **only** for deposits/withdrawals |

## Why a relayer?

Two reasons. **Privacy:** if Alice submitted the transaction herself she would be `msg.sender`,
re-linking her address to the payment and defeating the point. The relayer being the sender breaks
that link. **Liveness:** Alice may hold no gas token; the relayer pays gas for her. The relayer
cannot steal or redirect funds — the recipient, fee and amounts are all bound into the proof via
`ExtDataHash`, so changing any of them invalidates it. If relayers censor, an opt-in direct-RPC
fallback exists (it trades away sender privacy for liveness, and is **off by default**). See
[Fallbacks & resilience](fallbacks.html).

## Withdrawing

A **withdrawal** is the mirror of shielding: you prove ownership of in-pool notes and the pool
releases tokens to a chosen address. Here the amount *is* visible (tokens cross the boundary
again), but the link to your prior in-pool activity stays hidden. Internal payments and
withdrawals share the same circuit; only the external amount differs.

## Fees

A payment may include a fee paid to the relayer for the gas + service. The fee is part of the
value-conservation equation and is bound into the proof, so it cannot be inflated after the fact.

Next: [Association sets & compliance](concept-association.html) — how "clean origin" is proven.
