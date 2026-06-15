# Glossary

Short definitions of the terms used throughout these docs. Linked pages go deeper.

**Association root** — the Merkle root of the compliance good-set, stored in the pool. Every real
input must prove membership in it. See [Association sets & compliance](concept-association.html).

**Association-Set-Provider (ASP)** — the party that curates the good-set: which screened deposits
are admitted. It cannot spend funds or deanonymise users.

**Blinding** — a random value mixed into a note commitment so two notes with the same amount and
owner still hash to different commitments.

**Commitment (`C`)** — `H(amount, pubKey, blinding)`. The on-chain, opaque representation of a
note. Reveals nothing without the witness. See [The shielded pool](concept-pool.html).

**Curve-free key** — Cloister's key scheme, `pubKey = H(privKey)`, with no elliptic curve — which
structurally removes a class of self-double-spend bugs. See [Keys & recovery](concept-keys.html).

**ExtData / ExtDataHash** — external transaction data (recipient, relayer, fee, encrypted outputs)
and its hash, bound into the proof so it cannot be tampered with.

**Good-set** — the set of deposits known to be clean (screened). Synonym for the association set.

**Groth16** — the zk-SNARK proving system Cloister uses (over the BN254 curve), giving small,
fast-to-verify proofs.

**Lane** — one of several independent Merkle roots in the pool, enabling parallel transactions in a
single block. See [The shielded pool → Lanes](concept-pool.html#lanes-parallelism).

**Merkle tree** — the fixed-depth (2²⁰) tree of all commitments; its root summarises pool
membership so a note's existence can be proven without revealing which note.

**Note** — a unit of value in the pool (UTXO-style): an amount owned by a key. Spent and created in
2-in/2-out transactions. See [Private payments](concept-pay.html).

**Nullifier (`nf`)** — `H(C, leafIndex, sig)`. Published when a note is spent; deterministic per
note, but unlinkable to its commitment without the private key. Prevents double-spending.

**Off-chain insertion** — proving the Merkle root transition inside the circuit so the contract
does no on-chain hashing, cutting gas ~5×. See [The shielded pool](concept-pool.html#off-chain-merkle-insertion).

**Poseidon2** — a zk-friendly hash function, used both natively and in-circuit; the same hash for
keys, commitments, nullifiers and the Merkle tree.

**Proof of innocence** — proving funds belong to the good-set without revealing which member —
clean origin without deanonymisation.

**Relayer** — a broadcast-only service that submits a finished proof and pays gas, so the user's
address is never the on-chain sender. Cannot see the witness or redirect funds. See
[Private payments](concept-pay.html#why-a-relayer).

**Shielding** — depositing funds into the pool; the one public, screened touchpoint. See
[Shielding funds](concept-shield.html).

**Spend key** — the key that authorizes payments. Never shared. Distinct from the viewing key.

**View tag** — a 1-byte hint on each encrypted memo that lets a wallet skip ~255/256 of others'
notes without decrypting them.

**Viewing key** — a read-only key that decrypts the memos in its scope for selective disclosure;
cannot spend. See [Viewing keys & disclosure](concept-viewing-keys.html).

**Witness** — the private inputs to a proof (keys, amounts, blindings, Merkle paths). Never leaves
the device.

**Zero-knowledge proof (zk-SNARK)** — a proof that a statement is true while revealing nothing
beyond its truth. Cloister uses it to authorize payments and prove clean origin privately.
