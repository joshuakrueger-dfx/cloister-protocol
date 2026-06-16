# Shielding funds

Shielding is how value **enters** the pool. It is the single most important page for understanding
Cloister's compliance posture, because shielding is the **one public touchpoint** — the only place
where identity, amount and screening meet the chain.

## What happens when you shield

1. **Acquire clean funds.** You obtain stablecoins through a regulated, KYC-verified on-ramp —
   you complete KYC once, then buy USDC (bank transfer / card) that lands in your in-app wallet.
   (See the live flow in the [Console](https://app.cloister-protocol.com).)
2. **Screening.** Sanctions screening and geofencing run at this boundary. Only funds that pass
   are admitted to the good-set.
3. **Deposit.** You deposit the tokens into the pool contract. On-chain this is a visible ERC-20
   transfer of, say, 5,000 USDC into the pool — plus the creation of an **encrypted commitment**
   for a note of that value owned by your key.
4. **Admission to the good-set.** The screened deposit is added to the Association-Set-Provider's
   good-set, so it can later be proven "clean" when spent — without revealing which deposit it was.

After this, your 5,000 USDC no longer lives as a visible balance on your address. It lives in the
pool as the commitment `C = H(5000, pubKey, blinding)` — an opaque hash.

## Why shielding is public (and that is fine)

Tokens visibly cross the pool boundary, so the **deposit amount is visible** by construction —
just as a bank wire into an account is visible. What becomes private is everything **after**: how
that 5,000 USDC is split, spent, to whom, and what your balance is. The link between the public
deposit and any later private payment is broken by the zero-knowledge layer.

This is also exactly what makes Cloister compliant rather than a mixer: there is **no anonymous
entry**. Money with unknown origin cannot get in, and therefore cannot later be proven clean.

## What becomes public vs private

| | Public at shielding | Private afterward |
|---|---|---|
| Your identity | yes (KYC at on-ramp) | — |
| Deposit amount | yes (tokens cross the boundary) | — |
| Your in-pool balance | — | yes — hidden |
| Who you pay, and how much | — | yes — hidden |
| Link deposit → later payment | — | yes — broken |

## A worked example

Alice completes KYC and buys **5,000 USDC**. She shields all of it:

- On-chain: a 5,000 USDC transfer into the pool, and one new commitment.
- The world sees: *Alice deposited 5,000 USDC into Cloister.* Nothing more.

Later she pays three suppliers 1,000, 1,500 and 800 USDC over several weeks. The world sees three
unrelated shielded transactions with opaque commitments. **Nobody can tell** that the same 5,000
USDC funded them, who the suppliers are, or that Alice now holds 1,700 USDC of change. Each
payment still carries a proof that the funds trace to her screened deposit.

## Onramp → shield handoff

In the reference Console, the on-ramp and the shield step are wired together: once the bought USDC
arrives on-chain (the SDK polls the on-chain balance), the UI hands the amount straight to the
shield action — so "buy" flows into "shield" without copy-pasting amounts. ethers is lazy-loaded so
this path stays light until it is actually used.

## Test vs real funds

> In the current **Proof of Concept**, the local stack and the testnet relayer **mint test
> USDC** — there are no real funds. The Console labels the funding source as a *devnet faucet
> (test USDC)* precisely so this is never ambiguous. On mainnet, the screened on-ramp replaces the
> faucet; the shielding mechanics are identical.

Next: [Private payments](concept-pay.html) — how shielded value moves.
