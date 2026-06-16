# Cloister — Validierung

Jede Schicht ist durch einen automatisierten Test abgedeckt; das Protokoll wird anschließend mit einem
1000-Transaktionen-Soak und einer adversarialen Batterie auf einer lokalen Chain mit **echten gnark-Proofs** belastet.

## Unit- & Integrationssuites

| Suite | Was sie beweist | Ergebnis |
|-------|----------------|--------|
| `prover-gnark go test ./...` | Poseidon2 nativ == im Circuit; Note/Nullifier/Merkle; Circuit löst auf; Prover-Roundtrip; Mobile-Schnittstelle | ✅ bestanden |
| Circuit-Constraints | `TxCircuit`-Größe | **50.481** (inkl. ASP-Compliance) |
| Prove-Benchmark | Prove-Zeit im eingeschwungenen Zustand | **~190–220 ms** (≈ 8× ggü. 1,78 s circom/snarkjs) |
| `contracts hardhat test` | Guards (Reentrancy, Fee-on-Transfer, SafeERC20, Dup-Nullifier, Pause, Constructor), Verifier Accept/Reject, **Real-Proof-Deposit-E2E**, Replay | ✅ 12/12 |
| `sdk test/e2e-native.mjs` | das umverdrahtete SDK (kurvenfreier pubKey, Poseidon2, zero=0) baut einen Witness, der das Circuit erfüllt, und beweist ihn | ✅ bestanden |

## 1000-Transaktionen-Soak (`soak/soak.mjs`)

Ein Full-Stack-Stresstest auf einer lokalen Hardhat-Chain mit **echten Groth16-Proofs** (via
`proverd`), nicht mit Mocks. Er führt ein deterministisches Note-Modell für zwei Schlüsselinhaber
(Payer + Payee) und treibt einen realistischen Mix von Operationen an.

### Was jede Operation prüft

| Op | Inputs → Outputs | `extAmount` | Prüft |
|----|------------------|-------------|-------|
| **Deposit** | 0 real (2 Dummy) → `[amount, 0]` | `+amount` | Dummy-Input-Behandlung, `publicAmount = +amount`, Token-`transferFrom` + Balance-Delta-Prüfung, Einfügen eines frischen Leafs |
| **Transfer** | 1 Note → `[send, change]` an Payer/Payee | `0` | Real-Input-Membership + Nullifier, Werterhaltung (intern, keine Token-Bewegung), Verbergen des Betrags |
| **Withdraw** | 1 Note → `[change, 0]` | `−w` | feld-kodierter negativer `publicAmount = p − w`, `transfer` an Empfänger, Erhaltung `Σin = Σout + w` |

Die Operationsauswahl ist geseedet (reproduzierbar): Deposit, wenn der Note-Pool dünn ist oder mit
~35 % Wahrscheinlichkeit, sonst ~40 % Transfer / ~25 % Withdraw. Der lokale Merkle-Tree wird im
Gleichschritt mit der On-Chain-Einfügereihenfolge gehalten (Outputs belegen die nächsten zwei Leaves).

### Invarianten, die nach *jeder* Transaktion geprüft werden

1. `token.balanceOf(pool)` **==** Pool-Saldo des Modells (die Chain stimmt mit dem Ledger überein).
2. `Σ(unspent note amounts)` **==** Pool-Saldo des Modells (kein Wert wird erzeugt oder vernichtet).

Eine einzige Abweichung bricht den Lauf sofort ab, d. h. der Abschluss von 1000 txs bedeutet, dass alle 1000
beide Invarianten erfüllt haben.

### Ergebnis

```
   50/1000  pool=974576    notes=35   (19.6s)
  250/1000  pool=4572628   notes=189  (117.9s)
  500/1000  pool=8084249   notes=384  (293.0s)
  750/1000  …                          (≈580s)
 1000/1000  pool=16423849  notes=762  (786.7s)   {deposit:360, transfer:402, withdraw:238}
✓ 1000 txs OK
```

- **1000/1000 Transaktionen bestanden** — **360 Deposits, 402 Transfers, 238 Withdrawals**.
- ~0,79 s/tx Ende-zu-Ende (Witness-Build + Proof in On-Device-Klasse + On-Chain-Verifikation + Mining).
- Finaler Pool-Saldo **16.423.849** über **762 unverbrauchte Notes**; beide Invarianten hielten bei
  allen 1000 Transaktionen.
- Jeder Proof wurde vom echten gnark-Prover erzeugt und vom deployten Solidity-
  Verifier innerhalb von `ShieldedPool.transact` verifiziert — auf diesem Pfad gibt es nirgends einen Mock.

## Adversariale Batterie (`soak/adversarial.mjs`)

Jeder Angriff wird gegen den **echten deployten Pool** mit einem **echten gültigen Proof**
als Ausgangspunkt geführt, wobei dann genau eine Sache verfälscht wird. Jeder Angriff muss reverten; ein
einziger Erfolg bricht den Lauf ab. Zwei gültige Transaktionen werden dazwischengeschoben, um zu beweisen, dass der Pool
zwischen den Angriffen weiterhin ehrlichen Traffic akzeptiert.

| # | Angriff | Worauf er zielt | Kontrolle, die ihn abfängt | Ergebnis |
|---|--------|-----------------|-------------------------|--------|
| 1 | ein Bit im Proof `a[0]` kippen | Proof-Integrität | Groth16-Pairing-Prüfung (Verifier) | ✅ revert |
| 2 | einen anderen `newRoot` einreichen als den, auf den sich der Proof festlegt | Public-Input-Bindung | Verifier leitet `pub[]` neu ab; Abweichung lässt das Pairing fehlschlagen | ✅ revert |
| 3 | mit einem falschen `oldRoot` einreichen | Root-Frische / Fork | `require(oldRoot == laneRoot[lane])` | ✅ revert (`stale or unknown root`) |
| 4 | `extData.recipient` nach dem Beweisen ändern | Umleitung von Geldern durch einen Relayer | `ExtDataHash` ist ein gebundener Public Input; der Contract berechnet `keccak(extData)` neu → Abweichung | ✅ revert |
| 5 | `[nf0, nf0]` übergeben (derselbe Nullifier zweimal) | In-Tx-Double-Spend | `require(nf0 != nf1)` (und das Circuit prüft es) | ✅ revert (`duplicate nullifier`) |
| 6 | eine bereits gelandete tx wortgetreu wiederholen | Double-Spend per Replay | `nullifierSpent`-Set + veralteter Root | ✅ revert |
| 7 | eine bereits ausgegebene Note erneut ausgeben (ihren Nullifier wiederverwenden) | Cross-Tx-Double-Spend | globales `nullifierSpent`-Set | ✅ revert |

Dazwischengeschobener ehrlicher Traffic: ein gültiger Deposit landete (nach den Angriffen 1–5), und ein gültiges Ausgeben
dieser eingezahlten Note landete (vor den Angriffen 6–7) — was bestätigt, dass der Pool nicht einfach
alles ablehnt.

**Ergebnis:** **7/7 Angriffe reverteten**; beide dazwischengeschobenen gültigen Transaktionen waren erfolgreich.

> Hinweis: Das Harness verwendet `NonceManager.reset()` nach jedem erwarteten Revert, da eine tx,
> die bei der Gas-Schätzung fehlschlägt, nie eine On-Chain-Nonce verbraucht.

## Geprüfte Umgebungen

- **Go / Desktop** nativer Prover (Benchmark, Prover-Roundtrip).
- **proverd** HTTP-Backend (Soak, adversarial, SDK-E2E).
- **iOS-natives Modul** (gomobile-xcframework) — Go-Level-Schnittstelle getestet (`mobile`-
  Package); die Swift↔Go-Bridge **kompiliert + linkt** gegen das xcframework, und
  `MobileHash([1,2])` **auf dem gebooteten iPhone-Air-Simulator ausgeführt** lieferte einen Wert,
  der byte-identisch zum Go-/`proverd`-Poseidon2 (`4443…2364`) ist — Cross-Plattform-Konsistenz
  auf der iOS-Laufzeit bewiesen.
- **Auf echter iPhone-Air-Hardware (iOS 26.5.1):** der native gnark-Prover erzeugte einen vollständigen
  Groth16-Proof (50.481 Constraints) in **~366–438 ms** (Verifikation ~1 ms); der 9,3 MB große Proving
  Key wurde geladen und bewies ohne Speicherproblem — **komfortabel unter dem 1-s-Ziel** (Desktop
  lag bei ~200 ms; der ~2× ist auf mobilem ARM zu erwarten).
- Derselbe Witness verifiziert identisch über den nativen Verifikationspfad und den On-Chain-
  Solidity-Verifier (das Contract-E2E + die Per-tx-Verifikation des Soaks).

## Reproduzieren

```bash
# infra
cd packages/contracts && npx hardhat node &
cd packages/prover-gnark && go run ./cmd/proverd ./keys :8792 &

# suites
(cd packages/prover-gnark && go test ./...)
(cd packages/contracts && npx hardhat test)
(cd packages/sdk && node test/e2e-native.mjs http://127.0.0.1:8792)

# stress
(cd packages/contracts && node soak/soak.mjs 1000)
(cd packages/contracts && node soak/adversarial.mjs)
```

## Einschränkungen

- Soak/adversarial laufen auf einer lokalen Hardhat-Chain (gemäß dem gewählten Scope). Ein Base-Sepolia-
  Lauf + ein E2E auf physischem Gerät sind die verbleibenden Schritte (benötigen den Deployer-Key + das Telefon).
- Das Trusted Setup ist ein einzelner `groth16.Setup`-Lauf; Mainnet benötigt eine Phase-2-Zeremonie.
- Ein unabhängiges externes Audit ist erforderlich, bevor echter Wert gehandhabt wird.
