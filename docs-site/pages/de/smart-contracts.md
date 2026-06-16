# Smart Contracts

Cloisters On-Chain-Fußabdruck ist bewusst klein und auditierbar. Diese Seite listet die Verträge auf,
beschreibt, was jeder einzelne tut, und wo der Quellcode liegt.

> **Quelle der Wahrheit:** `packages/contracts` im
> [Cloister-Protocol-Repository](https://github.com/joshuakrueger-dfx/cloister-protocol). Die
> Verträge sind MIT-lizenziert und bauen auf OpenZeppelin auf. Deployte Adressen werden pro
> Netzwerk veröffentlicht, sobald die Deployments ausgerollt werden.

## Verträge

### `ShieldedPool.sol`
Der Pool selbst. Er hält:

- **`numLanes` unabhängige Merkle-Wurzeln** — eine pro Lane, was parallele Transaktionen in einem
  einzigen Block ermöglicht (siehe [Der Shielded Pool → Lanes](concept-pool.html#lanes-parallelism)).
- ein **globales Nullifier-Set** — Lane-übergreifende Verhinderung von Double-Spending.
- die **Association-(Compliance-)Root** — das Gate, dessen Zugehörigkeit jeder reale Input nachweisen muss.

Seine `transact`-Funktion leitet die öffentlichen Signale neu ab, ruft den Verifier auf, gibt dann die Input-
Nullifier aus, emittiert die Output-Commitments und schaltet die Lane-Wurzel weiter. Der Wurzel-Übergang
`oldRoot → newRoot` wird **im Circuit bewiesen**, sodass der Vertrag **kein On-Chain-Poseidon-
Hashing** durchführt – die Quelle der ~5×-Gas-Ersparnis.

### `Groth16Verifier.sol`
Der aus dem gnark-Trusted-Setup exportierte Verifier (MIT). Er prüft einen Groth16-Beweis gegen den
Verifying Key. Eine Diskrepanz zwischen Proving und Verifying Key ergibt `ProofInvalid`.

### `TransactionVerifier.sol`
Ein schlanker `(a, b, c)`-Struct-Adapter über dem gnark-Verifier, der den Beweis in der Form
präsentiert, die `ShieldedPool` erwartet.

### `PoolRegistry.sol`
Ein Register, das `chainId + asset → pool` abbildet. Es ist **2-step-owned**, **append-only** und führt
**sichtbare Migrationen** durch – sodass Integratoren den kanonischen Pool für ein Asset auf einer Chain
auflösen können, ohne einem undurchsichtigen, veränderlichen Pointer vertrauen zu müssen.

## Öffentliche Signale (die Schnittstelle Vertrag ↔ Circuit)

`ShieldedPool` und der Circuit stimmen in exakt **10 öffentlichen Signalen** in fester Reihenfolge überein: `Root`,
`PublicAmount`, `ExtDataHash`, zwei `InputNullifier`, zwei `OutputCommitment`, `NewRoot`,
`PairIndex` und `AssociationRoot`. Die vollständige Tabelle mit Bedeutungen findet sich in der
[Circuit-Spezifikation](circuit.html#public-signals-this-exact-order-matches-the-on-chain-verifier-pub-10).

## Design-Eigenschaften

| Eigenschaft | Wie sie erreicht wird |
|---|---|
| Kein On-Chain-Hashing | Merkle-Übergang im Circuit bewiesen (Off-Chain-Einfügung) |
| Kein Double-Spend | globales Nullifier-Set, Lane-übergreifend geteilt |
| Compliance On-Chain durchgesetzt | `AssociationRoot`-Zugehörigkeit für jeden realen Input erforderlich |
| Manipulationssicheres Routing | Empfänger/Relayer/Gebühr über `ExtDataHash` gebunden |
| Sichere Upgrades | `PoolRegistry` ist append-only mit sichtbarer Migration |

## Audit-Status

Die Verträge und der Circuit wurden in einem internen adversariellen Audit gehärtet. **Externe Audits und eine
Multi-Party-Phase-2-Trusted-Setup-Zeremonie sind vor dem Mainnet erforderlich** – die aktuellen Schlüssel stammen
aus einem einzigen Setup-Durchlauf. Siehe den [Haftungsausschluss](disclaimer.html) und
[Sicherheit](security.html).
