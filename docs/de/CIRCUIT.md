# Cloister — Circuit-Spezifikation

`TxCircuit` (gnark, Groth16 über BN254). Eine Shielded Transaction mit 2 Inputs / 2 Outputs.
Maßgebliche Quelle: `packages/prover-gnark/zk/circuit.go`. **50,481 R1CS-Constraints.**

## Primitive

- **Hash** `H`: Poseidon2 im Merkle–Damgård-Modus (`gnark-crypto .../poseidon2`). Der native
  Hash (`zk/hash.go`) ist nachweislich bit-identisch zum in-circuit Hasher, belegt durch `hash_test.go`.
- **Key**: `pubKey = H(privKey)` — kurvenfrei. Kein BabyJubJub, keine Subgroup-Order-Constraint.
- **Note-Commitment**: `C = H(amount, pubKey, blinding)`.
- **Signatur**: `sig = H(privKey, C, leafIndex)`.
- **Nullifier**: `nf = H(C, leafIndex, sig)` — deterministisch je (Note, Position), ohne `privKey`
  nicht mit `C` verknüpfbar.
- **Merkle**: feste Tiefe `Levels = 20` (2²⁰ ≈ 1.05M Notes). Leeres Blatt = `0`. Knoten `= H(l, r)`.

## Public Signals (genau diese Reihenfolge; passt zum On-Chain-Verifier + `pub[10]`)

| # | Name | Bedeutung |
|---|------|---------|
| 0 | `Root` | Pool-Merkle-Root, gegen den die Inputs bewiesen werden |
| 1 | `PublicAmount` | `extAmount − fee`, feldkodiert (Deposit `+`, Withdraw `p − |x|`) |
| 2 | `ExtDataHash` | `keccak(extData) mod p` — bindet Empfänger / Relayer / Fee / verschlüsselte Outputs |
| 3 | `InputNullifier[0]` | |
| 4 | `InputNullifier[1]` | |
| 5 | `OutputCommitment[0]` | |
| 6 | `OutputCommitment[1]` | |
| 7 | `NewRoot` | Root nach Einfügen der beiden Outputs als ein Paar-Knoten |
| 8 | `PairIndex` | Insertion-Slot (`= laneNextIndex / 2`) |
| 9 | `AssociationRoot` | Compliance: Inputs als ∈ ASP-Good-Set bewiesen |

## Erzwungene Constraints

Für jeden Input `t ∈ {0,1}`:
1. `pub = H(privKey_t)`, `C = H(amount_t, pub, blinding_t)`, `sig = H(privKey_t, C, idx_t)`,
   `nf = H(C, idx_t, sig)`; **assert** `nf == InputNullifier[t]`.
2. **Range**: `amount_t ∈ [0, 2²⁴⁸)` (via `ToBinary`, verhindert Wertfälschung durch Field-Wrap).
3. `isReal = 1 − IsZero(amount_t)`. Dummy-Inputs (mit Wert null) überspringen die Membership-Prüfung.
4. **Pool-Membership** (nur real): `climb(C, idx_t, pathEls_t) == Root`, erzwungen durch
   `(root − Root)·isReal == 0`.
5. **ASP-Membership** (nur real): `climb(C, assocIdx_t, assocEls_t) == AssociationRoot`.

Für jeden Output `t`:
6. `C = H(amount_t, pubKey_t, blinding_t)`; **assert** `C == OutputCommitment[t]`.
7. **Range**: `amount_t ∈ [0, 2²⁴⁸)`.

Global:
8. `AssertIsDifferent(InputNullifier[0], InputNullifier[1])` — kein Double-Spend innerhalb der Tx.
9. **Werterhaltung**: `Σ inAmount + PublicAmount == Σ outAmount` (im Feld).
10. `ExtDataHash` ist als Public Input gebunden (manipulationsfest).
11. **Off-Chain-Insertion**: mit `z1 = H(0,0)` und `pairNode = H(out0, out1)`,
    `climb(z1, PairIndex, pairPathEls) == Root` (der Slot war leer) **und**
    `climb(pairNode, PairIndex, pairPathEls) == NewRoot` (korrekte Insertion, gleiche Siblings).

## Anmerkungen zur Soundness

- **Werterhaltung lässt sich nicht durch Field-Wrap fälschen**: Jeder Betrag wird per Range-Check
  auf 248 Bit begrenzt, und es gibt nur vier davon, sodass `Σ` weit unterhalb von `p` bleibt.
  `PublicAmount` wird vom Vertrag festgelegt (kein freier Witness) und durch
  `MAX_EXT_AMOUNT = 2²⁴⁸` beschränkt. Für ein Withdrawal gilt `PublicAmount = p − (W+F)`;
  der einzelne modulare Wrap ergibt die eindeutige ganzzahlige Relation `Σin = Σout + W + F`.
- **Soundness leerer Slots**: Einen belegten Slot als leer vorzutäuschen würde ein Poseidon2-
  Second-Preimage erfordern (`climb(z1, …) == Root` mit gefälschten Siblings) — praktisch unmöglich.
- **Nullifier bindet die Position**: Eine Note an einem festen Blatt hat genau einen Nullifier; in
  Kombination mit dem On-Chain-Spent-Set verhindert dies Replay/Double-Spend.
- **extData-Bindung**: Groth16 bindet alle deklarierten Public Inputs, sodass das Ändern eines
  beliebigen extData-Felds den `ExtDataHash` verändert und den Proof ungültig macht — ein Relayer
  kann Mittel nicht umleiten.

## Trusted Setup

`groth16.Setup` (eigener Lauf) erzeugt `pk/vk`; der Verifier wird aus `vk` exportiert. Dasselbe
Setup speist sowohl den Prover als auch den On-Chain-Verifier (ein Mismatch ergibt `ProofInvalid`).
**Für das Mainnet ist eine mehrparteiige Phase-2-Ceremony erforderlich**, um die Single-Run-Keys
zu ersetzen.
