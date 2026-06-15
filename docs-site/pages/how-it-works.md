# How it works

A shielded, encrypted pool: deposit once, then pay privately as often as you like, settle
on-chain, and never reveal the payer's identity — while keeping a provable clean-origin trail.

This page walks the full life of a payment. We use a running example: **Alice pays Bob 1,000
USDC** for an invoice.

## The four steps

### 1 · Shield — the one public touchpoint

Alice loads funds into the pool once. This is the **only** moment her identity and the amount
are public, and it is deliberately gated: **KYC, sanctions screening and geofencing run here**.
She deposits, say, 5,000 USDC.

On-chain, the deposit creates an **encrypted commitment** — `C = H(amount, pubKey, blinding)`,
a Poseidon2 hash. It proves a note exists without revealing its amount or owner. From this point
on, Alice's 5,000 USDC lives inside the pool as opaque hashes, not as a visible balance on her
address.

> Think of shielding as wiring money into a numbered account whose statements only you can read.
> The wire is visible; everything after it is not.

### 2 · Pay privately — a proof, not a transfer

To pay Bob 1,000 USDC, Alice's wallet builds a **zero-knowledge proof** on her device. The proof
attests, without revealing any of the underlying values, that:

- she owns input notes worth at least 1,000 USDC that exist in the pool,
- those notes belong to the compliance good-set (clean origin),
- the math balances: `inputs = outputs + payment + fee`,
- and the notes have not been spent before (a unique *nullifier* is revealed).

The result is two new commitments — one 1,000-USDC note for Bob, one 4,000-USDC "change" note
back to Alice — plus an encrypted memo Bob can find. **No address, no amount, no balance** is
exposed. The internal payment is an encrypted note, not a visible ERC-20 `transfer`.

### 3 · Off-chain insertion — settle cheaply

A **broadcast-only relayer** receives the finished proof and calldata, pays the gas, and submits
the transaction. Because the relayer is `msg.sender`, **Alice's address never appears on-chain.**

The pool contract verifies the proof and updates its Merkle tree. The clever part: the new tree
root is **proven inside the circuit**, so the contract does *no* on-chain hashing. That cuts the
cost from ≈1.74M gas to **≈350k gas — roughly 5× cheaper**. (See
[Off-chain insertion](concept-pool.html#off-chain-merkle-insertion).)

### 4 · Discover — Bob finds his money, privately

The indexer observes the new commitments. Each output carries an encrypted memo with a 1-byte
**view tag**. Bob's wallet checks tags and rejects ~255/256 of other people's notes instantly,
decrypting only the candidate that is actually his. He learns he received 1,000 USDC; nobody
else does — and nobody learns it came from Alice.

To anyone watching the chain, all that happened is: *some* shielded transaction occurred, two
opaque commitments appeared, two opaque nullifiers were spent. The payer, the recipient, the
amount, and the link between them are all hidden.

## What each party sees

| Party | Sees | Does **not** see |
|---|---|---|
| On-chain observer | a shielded tx happened; opaque commitments + nullifiers | payer, recipient, amount, balances |
| The relayer | the finished proof + public calldata | private keys, amounts, who Alice is |
| Bob (recipient) | the 1,000 USDC note addressed to him | Alice's address or her other balances |
| An authorized auditor (with a viewing key) | exactly the history the key unlocks | anything outside that key's scope |

## Parallelism — many payments per block

A naive shielded pool serialises: every transaction mutates the single Merkle root, so two
payments in the same block conflict. Cloister runs **independent lanes**, each with its own root,
sharing one global nullifier set for safety. In the PoC, **6 of 6 payments landed in the same
block in parallel**. (See [The shielded pool → Lanes](concept-pool.html#lanes-parallelism).)

---

That is the whole flow. The privacy comes from the zero-knowledge note layer; the compliance
comes from [association-set inclusion](concept-association.html) and
[viewing keys](concept-viewing-keys.html). Read the Core concepts section next, or jump straight
to the [Architecture](architecture.html).
