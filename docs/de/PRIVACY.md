# Cloister — Privacy

Was Cloister verbirgt, was es offenlegt und wo die Vertrauensgrenzen verlaufen.

## Was ein On-Chain-Beobachter sieht

- **Verborgen**: welche Input-Note welchen Output finanziert hat, die Note-Beträge, der Eigentümer
  einer Note sowie die Verknüpfung zwischen einem Zahler und einem Empfänger. Commitments und
  Nullifier sind Poseidon2-Hashes, die ohne den Witness nichts preisgeben.
- **Sichtbar**: dass *eine* Shielded Transaction stattgefunden hat, die neuen Commitments (opak),
  die ausgegebenen Nullifier (opak), der Netto-Token-Zu-/Abfluss des Pools bei Deposits/Withdrawals
  (`extAmount`) sowie die Relayer-/Empfängeradressen, die bei Deposit/Withdraw Tokens berühren.
- Interne Transfers (`extAmount == 0`) bewegen **keine Tokens** — nur Commitments/Nullifier
  ändern sich, sodass die Beträge vollständig verborgen bleiben.

## Wo das Proving stattfindet (die zentrale Privacy-Garantie)

Das Proving läuft **on-device** im nativen Modul; der Witness (private Keys, Beträge, Blindings,
Pfade) verlässt das Telefon nie. Der Relayer erhält nur den fertigen Proof + die öffentliche Calldata
und erfährt daher nichts Privates und kann den Nutzer nicht deanonymisieren.

> `proverd` (der HTTP-Prover) sieht den Witness und ist daher **nur für Dev/CI**. Er darf niemals
> der produktive Proving-Pfad sein. Die Wallet nutzt ausschließlich das native Modul.

## Sender-Privacy

Der **broadcast-only Relayer** zahlt Gas und ist on-chain der `msg.sender`, sodass die Adresse des
Nutzers nicht mit der Transaktion verknüpft wird. Der optionale Direct-RPC-Fallback (`allowDirect`)
gibt dies zugunsten von Liveness auf — er macht den Nutzer zum Sender — und ist **standardmäßig
deaktiviert**.

## Note-Discovery (Empfängerseite)

Outputs tragen ein verschlüsseltes Memo (`nacl box`, x25519) mit einem 1-Byte-**View-Tag**. Eine
Wallet verwirft ~255/256 fremder Notes allein anhand des Tags und entschlüsselt nur Kandidaten —
so skaliert die Discovery, ohne dass die Scan-Kosten verraten, welche Notes Ihnen gehören.
Viewing-Keys werden aus dem Spend-Key abgeleitet (ein Seed → vollständige Wiederherstellung).

## Compliance vs. Privacy

Der Good-Set-Inklusionsbeweis des ASP (`AssociationRoot`) zeigt, dass die Mittel „sauber" sind,
**ohne offenzulegen, welches** Good-Set-Mitglied sie sind — Compliance ohne Deanonymisierung. Das
Good-Set wächst monoton, sodass alte Roots gültig bleiben und Root-Updates nicht mit Nutzer-Proofs
in eine Race-Condition geraten.

## Vertrauensgrenzen

| Partei | Erfährt | Kann |
|-------|--------|--------|
| Chain-Beobachter | dass eine Tx stattfand; opake Commitments/Nullifier; Deposit-/Withdraw-Beträge | nichts Privates |
| Relayer | den öffentlichen Proof + Calldata | broadcasten oder zensieren (gemildert durch mehrere Relayer + Direct-Fallback); **nicht** deanonymisieren |
| Indexer | öffentliche Commitments/verschlüsselte Memos | Discovery bereitstellen; fremde Memos nicht entschlüsseln |
| ASP | das von ihm kuratierte Good-Set | Compliance-Policy definieren; nicht ausgeben oder deanonymisieren |
| Gerät | alles (es ist der Eigentümer) | — |

## Anmerkungen zu Betrag/Timing

Beträge sind bei internen Transfers verborgen. Deposit-/Withdraw-Beträge sind konstruktionsbedingt
sichtbar (Tokens überschreiten die Pool-Grenze). Die Widerstandsfähigkeit gegen Timing-/Graph-Analyse
verbessert sich mit der Größe des Anonymity-Sets und dem Relayer-Batching; zur Roadmap siehe die
Entwurfsdokumente.
