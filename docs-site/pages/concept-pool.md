# The shielded pool

The shielded pool is the heart of Cloister: a single smart contract that holds value as a set of
**encrypted commitments** and lets that value move privately. This page explains the data
structures it keeps and why each one exists.

## Notes — value as a hash

Inside the pool, money is not an account balance. It is a set of **notes**, in the style of
Bitcoin's UTXOs. A note represents an amount owned by a key, and on-chain it appears only as its
commitment:

```
C = H(amount, pubKey, blinding)
```

- `amount` — the value of the note (e.g. 1,000 USDC), hidden inside the hash.
- `pubKey` — the owner's public key, `pubKey = H(privKey)` (see [Keys & recovery](concept-keys.html)).
- `blinding` — a random value so two notes of equal amount and owner still produce different commitments.
- `H` — **Poseidon2**, a hash designed to be cheap inside a zk circuit.

Because `C` is a hash, the commitment reveals **nothing** — not the amount, not the owner. Yet the
owner can later prove, in zero knowledge, that they know the `amount`, `pubKey` and `blinding`
behind a specific `C`.

A payment **consumes** input notes and **creates** output notes. Cloister uses a fixed
**2-input / 2-output** shape: up to two notes in, exactly two out (the payee's note and a
"change" note back to the sender). Smaller payments use a zero-value *dummy* input.

## The Merkle tree — membership without a list

All commitments ever created are leaves of a fixed-depth **Merkle tree** (depth 20 → up to
2²⁰ ≈ 1.05 million notes). The single 32-byte **root** summarises the entire set.

To spend a note you prove, in zero knowledge, that its commitment is a leaf under the current
root — *without revealing which leaf*. This is how the pool checks "this note really exists and is
unspent" without ever learning which note you mean.

```
                root
               /    \
            H(·,·)   H(·,·)
            /   \     /   \
          C0    C1  C2    C3   …   (your note is one of these — but which is hidden)
```

## Nullifiers — spending exactly once

If commitments were simply "marked spent", that would reveal which note moved. Instead, spending
a note reveals its **nullifier**:

```
nf = H(C, leafIndex, sig)      where  sig = H(privKey, C, leafIndex)
```

The nullifier is deterministic for a given note at a given position, but **unlinkable** to its
commitment without the private key. The contract keeps a global **nullifier set**; a transaction
whose nullifier is already present is rejected. So:

- You can spend a note **once** (its nullifier can only be published once).
- Nobody can tell *which* commitment a nullifier corresponds to.
- The set is **global across all lanes**, so you cannot double-spend by racing two lanes.

## Off-chain Merkle insertion

Inserting two new commitments into a Merkle tree normally means recomputing hashes up the tree
**on-chain** — expensive, because hashing dominates gas. Cloister moves this work into the proof.

The circuit proves two things about the insertion slot:

1. the slot was **empty** before — `climb(emptyLeaf, slot, siblings) == oldRoot`, and
2. inserting the new pair yields the new root — `climb(pairNode, slot, siblings) == newRoot`,
   using the *same* sibling path.

Both `oldRoot` and `newRoot` are public outputs of the proof. The contract simply checks the
proof and stores `newRoot` — it performs **no Poseidon hashing at all**. Result: **≈350k gas per
payment instead of ≈1.74M — about 5× cheaper.** Forging this would require a Poseidon2
second-preimage, which is infeasible.

## Lanes — parallelism

A single root is a bottleneck: every payment changes it, so two payments in the same block
collide (the second sees a stale root). Cloister keeps **several independent lanes**, each with
its own Merkle root, while all lanes share **one global nullifier set**.

- Independent roots → multiple payments settle **in parallel, in the same block**. The PoC landed
  **6 of 6** concurrently.
- One shared nullifier set → you still cannot double-spend across lanes; safety is preserved.

## The compliance gate

The pool also stores the **Association root** — the root of the compliance good-set. Every real
input note must prove membership in it, so only screened funds can be spent. This is covered in
detail under [Association sets & compliance](concept-association.html).

## Putting it together

A `transact` call carries: a Merkle `Root` to prove against, two `InputNullifier`s, two
`OutputCommitment`s, a `NewRoot`, the insertion slot, the `AssociationRoot`, the net external
amount (for deposits/withdrawals), and a hash binding the recipient/relayer/fee. The contract
re-derives these public signals, calls the verifier, and on success spends the nullifiers, emits
the commitments, and advances the lane root. The full list is the
[circuit's public signals](circuit.html#public-signals-this-exact-order-matches-the-on-chain-verifier-pub-10).

Next: [Shielding funds](concept-shield.html) — how value enters the pool.
