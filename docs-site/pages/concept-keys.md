# Keys & recovery

Cloister is **self-custodial**: you hold the keys, and the most sensitive operation — proving —
happens on your own device. This page explains the key hierarchy, how recovery works, and why the
design eliminates an entire class of cryptographic bug.

## One seed, many keys

Everything derives deterministically from a single **seed** (a standard BIP39 mnemonic, the same
kind of backup phrase a normal crypto wallet uses). From it Cloister derives:

```
seed
 ├─ spend key      → authorizes payments (privKey)
 │    └─ pubKey = H(privKey)        (your address inside the pool)
 ├─ viewing key    → read-only disclosure of your transactions
 └─ encryption key → decrypts incoming note memos (x25519)
```

Because all keys come from one seed, **a single backup recovers your entire pool history and
balance** — there is no separate per-note secret to lose. Restore the mnemonic on a new device and
the wallet re-derives every key, re-scans the chain, and rebuilds your notes.

## Curve-free keys — `pubKey = H(privKey)`

Most shielded-pool designs build keys on an elliptic curve (e.g. BabyJubJub). Cloister instead
uses a **curve-free** key: your public key is simply the hash of your private key,
`pubKey = H(privKey)`, with Poseidon2.

This is a deliberate security choice. Curve-based note schemes have a subtle, well-known
self-double-spend class tied to the curve's subgroup order — an attacker who understands the
scalar arithmetic can sometimes craft two valid nullifiers for one note. By **removing the curve
entirely**, Cloister structurally eliminates that whole bug class: there is no scalar, no subgroup
order, nothing to exploit. It also makes the circuit smaller and the same hash usable natively and
in-circuit.

## Spending vs viewing — separated by design

The spend key and the viewing key are different keys for a reason
([Viewing keys & disclosure](concept-viewing-keys.html)):

- Share your **viewing key** with an auditor → they can *read* the scoped history, never spend.
- Your **spend key** never leaves the device and is never shared.

This separation is what makes compliant disclosure safe: you can prove your history without ever
risking your funds.

## On-device proving — the privacy core

When you pay, your wallet assembles a **witness** (private keys, amounts, blindings, Merkle paths)
and the **native prover** builds the zero-knowledge proof **on the device**. The witness never
leaves the phone; the relayer and the chain see only the finished proof.

> A development-only HTTP prover (`proverd`) exists for CI and local testing and **does** see the
> witness — which is exactly why it must never be used as a production path. Production wallets use
> the native on-device prover exclusively. See [Privacy model](privacy.html).

## Recovery checklist

| You have | You can recover |
|---|---|
| the seed phrase | spend + viewing + encryption keys → full balance & history |
| only a viewing key | read-only view of the scoped transactions (no spend) |
| nothing | nothing — there is no custodian backdoor (this is the point of self-custody) |

Guard the seed phrase as you would any crypto wallet's: it is the single root of both your funds
and your privacy.

Next: the [Architecture](architecture.html) for the full system design, or the [FAQ](faq.html).
