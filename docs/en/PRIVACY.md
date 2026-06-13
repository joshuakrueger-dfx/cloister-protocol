# Cloister — Privacy

What Cloister hides, what it reveals, and where the trust boundaries are.

## What an on-chain observer sees

- **Hidden**: which input note funded which output, the note amounts, the owner of any
  note, and the link between a payer and a recipient. Commitments and nullifiers are
  Poseidon2 hashes that reveal nothing without the witness.
- **Visible**: that *a* shielded transaction occurred, the new commitments (opaque), the
  spent nullifiers (opaque), the pool's net token in/out for deposits/withdrawals
  (`extAmount`), and the relayer/recipient addresses that touch tokens for deposit/withdraw.
- Internal transfers (`extAmount == 0`) move **no tokens** — only commitments/nullifiers
  change, so amounts are fully hidden.

## Where proving happens (the core privacy guarantee)

Proving runs **on-device** in the native module; the witness (private keys, amounts,
blindings, paths) never leaves the phone. The relayer receives only the finished proof +
public calldata, so it learns nothing private and cannot deanonymize the user.

> `proverd` (the HTTP prover) sees the witness and is therefore **dev/CI only**. It must
> never be the production proving path. The wallet uses the native module exclusively.

## Sender privacy

The **broadcast-only relayer** pays gas and is the `msg.sender` on chain, so the user's
address is not linked to the transaction. The opt-in direct-RPC fallback (`allowDirect`)
trades this away for liveness — it makes the user the sender — and is **off by default**.

## Note discovery (recipient side)

Outputs carry an encrypted memo (`nacl box`, x25519) with a 1-byte **view tag**. A wallet
rejects ~255/256 of others' notes by tag alone, decrypting only candidates — so discovery
scales without scanning-cost leaking which notes are yours. Viewing keys are derived from
the spend key (one seed → full recovery).

## Compliance vs privacy

The ASP good-set inclusion proof (`AssociationRoot`) shows the funds are "clean" **without
revealing which** good-set member they are — compliance without deanonymization. The good
set grows monotonically, so old roots stay valid and root updates don't race user proofs.

## Trust boundaries

| Party | Learns | Can do |
|-------|--------|--------|
| Chain observer | tx happened; opaque commitments/nullifiers; deposit/withdraw amounts | nothing private |
| Relayer | the public proof + calldata | broadcast or censor (mitigated by multiple relayers + direct fallback); **not** deanonymize |
| Indexer | public commitments/encrypted memos | serve discovery; cannot decrypt others' memos |
| ASP | the good set it curates | define compliance policy; cannot spend or deanonymize |
| Device | everything (it is the owner) | — |

## Amount/timing notes

Amounts are hidden for internal transfers. Deposit/withdraw amounts are visible by
construction (tokens cross the pool boundary). Timing/graph-analysis resistance improves
with anonymity-set size and relayer batching; see the design docs for the roadmap.
