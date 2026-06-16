# Cloister — Sicherheit

Bedrohungsmodell und die Kontrollen, die jede Bedrohung adressieren, wie umgesetzt. Belege
zur Validierung finden sich in `VALIDATION.md`.

## Schutzgüter & Angreifer

- **Schutzgüter**: gepoolte Mittel (ERC-20), die Integrität des Note-Sets, die
  Unverknüpfbarkeit der Nutzer.
- **Angreifer**: ein bösartiger Zahler (Wert fälschen / Double-Spend), ein bösartiger Relayer
  (Mittel umleiten / zensieren), ein Chain-Beobachter (Deanonymisierung), eine bösartige oder
  kompromittierte ASP (Compliance-Umgehung) und ein kompromittierter Verifier
  (Defense-in-Depth).

## Contract-Kontrollen (`ShieldedPool.sol`)

| Bedrohung | Kontrolle |
|--------|---------|
| Reentrancy über Hook-Tokens (ERC-777/1363) | `ReentrancyGuard` + striktes Checks-Effects-Interactions: der gesamte State (Nullifier, Root, Index) wird **vor** jedem Token-Transfer geschrieben |
| Fee-on-Transfer / Rebasing-Unterdeckung | ein Deposit schreibt nur das **gemessene Balance-Delta** gut; ein zu geringer Transfer revertet (`fee-on-transfer unsupported`) |
| Nicht-standardkonforme ERC-20 (USDT-artig ohne Return) | `SafeERC20` für jeden Transfer |
| Double-Spend innerhalb einer Transaktion | `inputNullifiers[0] != [1]` (auch der Circuit stellt dies sicher) |
| Cross-Tx- / Cross-Lane-Double-Spend | globales `nullifierSpent`-Set |
| Veraltete / geforkte Root | `oldRoot == laneRoot[lane]` |
| Lane-Overflow | expliziter Guard `laneNextIndex + 2 <= 2^levels` ("lane full") |
| Durch den Operator eingefrorene Mittel | der Guardian kann **Deposits** pausieren; ein zeitlich begrenzter `emergencyPause` kann für Incident-Response alle Tx stoppen, ist aber **nicht erneuerbar** (ein `PAUSE_COOLDOWN` garantiert ein offenes Withdrawal-Fenster zwischen Pausen) → Mittel können nie dauerhaft eingefroren werden |
| Compliance-Umgehung | `asp == 0` (Dev) **oder** `knownAspRoot[associationRoot]`; der Circuit beweist, dass die realen Inputs ∈ dieser Root liegen; die ASP kann eine Root per `revokeAspRoot` **widerrufen**, falls sie später illegitime Notes enthält |
| Wertebereich der Public Inputs | der gnark-Verifier weist jeden Public Input `≥ p` zurück (`checkField`) |
| Gefälschter Wert | der Circuit range-checkt alle Beträge auf 248 Bit + Erhaltung innerhalb des Felds |
| Umgeleitetes Withdrawal / Fee | Recipient, Relayer, Fee und Encrypted Outputs werden über `ExtDataHash` (ein Public Input) gebunden |
| Registry-Hijack | `PoolRegistry` ist `Ownable2Step`, append-only `register`, explizites `migrate` emittiert alt+neu |

## Circuit-Kontrollen

Der Circuit ist die zweite Verteidigungslinie gegen Double-Spend (`AssertIsDifferent`) und
die einzige Linie für Werterhaltung, Membership, Compliance und den Off-Chain-Insertion-Proof.
Siehe `CIRCUIT.md` für das Soundness-Argument je Constraint (Field-Wrap, Empty-Slot,
Nullifier-Bindung, ExtData-Bindung).

## Relayer- / Submission-Kontrollen

- Der Relayer ist **broadcast-only**: er erhält einen fertigen Proof und niemals das Witness.
- `submitShielded` ist **idempotent**: vor dem (erneuten) Submit prüft es `nullifierSpent` auf
  der Chain, sodass eine verlorene Antwort niemals zu einem Doppel-Submit führen kann (was die
  Note verbrennen würde).
- Alle Netzwerkaufrufe sind timeout-begrenzt; der UI-Watchdog kann stets auflösen oder
  fehlschlagen.

## Defense-in-Depth

Der Contract prüft Invarianten erneut, die der Circuit bereits garantiert (unterschiedliche
Nullifier, Spent-Set), sodass selbst ein (hypothetisch) kompromittierter Verifier weder einen
Double-Spend innerhalb einer Transaktion noch einen Cross-Tx-Double-Spend ermöglichen noch den
Pool über Reentrancy leeren kann.

## Bekannte Restrisiken (vor dem Mainnet zwingend zu adressieren)

1. **Trusted Setup**: die Keys stammen aus einem einzelnen `groth16.Setup`-Lauf. Das Mainnet
   **erfordert eine Multi-Party-Phase-2-Zeremonie**.
2. **ASP-Vertrauen**: die ASP definiert das Good-Set; eine bösartige ASP könnte illegitime
   Commitments aufnehmen. Dies ist eine Policy-/Betriebskontrolle, keine kryptographische.
3. **Registry-/Guardian-/ASP-Keys**: in Produktion **müssen** Owner/Guardian/ASP ein
   **Multisig + Timelock** sein.
4. **Token-Annahme**: der Pool nimmt beim Deployment einen wohlverhaltenden ERC-20 an;
   Fee-on-Transfer wird zur Laufzeit zurückgewiesen, doch die deployte Token-Adresse muss das
   reale Asset sein.
5. **Audit**: ein unabhängiges externes Audit von Contracts + Circuit ist erforderlich, bevor
   reale Werte verarbeitet werden. Die hier genannten Erkenntnisse stammen aus internem Review
   + dem Soak-Test in `VALIDATION.md`.
