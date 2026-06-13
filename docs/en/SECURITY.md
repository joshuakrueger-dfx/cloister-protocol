# Cloister — Security

Threat model and the controls that address each threat, as built. Validation evidence is
in `VALIDATION.md`.

## Assets & adversaries

- **Assets**: pooled funds (ERC-20), the integrity of the note set, user unlinkability.
- **Adversaries**: a malicious payer (forge value / double-spend), a malicious relayer
  (redirect funds / censor), a chain observer (deanonymize), a malicious or compromised
  ASP (compliance bypass), and a compromised verifier (defense-in-depth).

## Contract controls (`ShieldedPool.sol`)

| Threat | Control |
|--------|---------|
| Reentrancy via hook tokens (ERC-777/1363) | `ReentrancyGuard` + strict Checks-Effects-Interactions: all state (nullifiers, root, index) is written **before** any token transfer |
| Fee-on-transfer / rebasing under-collateralisation | deposit credits only the **measured balance delta**; a short transfer reverts (`fee-on-transfer unsupported`) |
| Non-standard ERC-20 (USDT-style no-return) | `SafeERC20` for every transfer |
| In-tx double-spend | `inputNullifiers[0] != [1]` (and the circuit also asserts it) |
| Cross-tx / cross-lane double-spend | global `nullifierSpent` set |
| Stale / forked root | `oldRoot == laneRoot[lane]` |
| Lane overflow | explicit `laneNextIndex + 2 <= 2^levels` ("lane full") guard |
| Funds frozen by operator | guardian can pause **deposits only**; withdrawals are never blockable |
| Compliance bypass | `asp == 0` (dev) **or** `knownAspRoot[associationRoot]`; the circuit proves real inputs ∈ that root |
| Public-input range | the gnark verifier rejects any public input `≥ p` (`checkField`) |
| Forged value | circuit range-checks all amounts to 248 bits + conservation in-field |
| Redirected withdrawal / fee | recipient, relayer, fee, encrypted outputs are bound via `ExtDataHash` (a public input) |
| Registry hijack | `PoolRegistry` is `Ownable2Step`, append-only `register`, explicit `migrate` emits old+new |

## Circuit controls

The circuit is the second line for double-spend (`AssertIsDifferent`) and the only line
for value conservation, membership, compliance, and the off-chain insertion proof. See
`CIRCUIT.md` for the per-constraint soundness argument (field-wrap, empty-slot, nullifier
binding, extData binding).

## Relayer / submission controls

- The relayer is **broadcast-only**: it receives a finished proof and never the witness.
- `submitShielded` is **idempotent**: before (re)submitting it checks `nullifierSpent` on
  chain, so a lost response can never cause a double-submit (which would burn the note).
- All network calls are timeout-bounded; the UI watchdog can always resolve or fail.

## Defense-in-depth

The contract re-checks invariants the circuit already guarantees (distinct nullifiers,
spent-set), so even a (hypothetically) compromised verifier cannot enable an in-tx or
cross-tx double-spend or drain the pool via reentrancy.

## Known residual risks (must be addressed before mainnet)

1. **Trusted setup**: keys come from a single `groth16.Setup` run. Mainnet **requires a
   multi-party Phase-2 ceremony**.
2. **ASP trust**: the ASP defines the good set; a malicious ASP could include illicit
   commitments. This is a policy/operational control, not a cryptographic one.
3. **Registry / guardian / ASP keys**: in production the owner/guardian/ASP **must be a
   multisig + timelock**.
4. **Token assumption**: the pool assumes a well-behaved ERC-20 at deploy; fee-on-transfer
   is rejected at runtime, but the deployed token address must be the real asset.
5. **Audit**: an independent external audit of contracts + circuit is required before
   handling real value. The findings here are from internal review + the soak in `VALIDATION.md`.
