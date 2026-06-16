# Der abgeschirmte Pool

Der abgeschirmte Pool ist das Herzstück von Cloister: ein einzelner Smart Contract, der Werte als
Menge **verschlüsselter Commitments** verwahrt und diese Werte privat bewegen lässt. Diese Seite
erklärt die Datenstrukturen, die er führt, und warum jede davon existiert.

## Notes — Werte als Hash

Im Pool ist Geld kein Kontosaldo. Es ist eine Menge von **Notes**, im Stil der UTXOs von Bitcoin.
Eine Note steht für einen Betrag, der einem Schlüssel gehört, und erscheint on-chain nur als ihr
Commitment:

```
C = H(amount, pubKey, blinding)
```

- `amount` — der Wert der Note (z. B. 1.000 USDC), verborgen im Hash.
- `pubKey` — der öffentliche Schlüssel des Inhabers, `pubKey = H(privKey)` (siehe [Schlüssel & Wiederherstellung](concept-keys.html)).
- `blinding` — ein Zufallswert, damit zwei Notes mit gleichem Betrag und Inhaber dennoch unterschiedliche Commitments erzeugen.
- `H` — **Poseidon2**, ein Hash, der für geringe Kosten innerhalb einer zk-Schaltung entworfen wurde.

Da `C` ein Hash ist, gibt das Commitment **nichts** preis — weder den Betrag noch den Inhaber.
Dennoch kann der Inhaber später in Zero Knowledge beweisen, dass er `amount`, `pubKey` und
`blinding` hinter einem bestimmten `C` kennt.

Eine Zahlung **verbraucht** Input-Notes und **erzeugt** Output-Notes. Cloister verwendet eine feste
**2-Input/2-Output**-Form: bis zu zwei Notes hinein, genau zwei hinaus (die Note des Empfängers und
eine „Wechselgeld"-Note zurück an den Absender). Kleinere Zahlungen nutzen einen *Dummy*-Input mit
dem Wert null.

## Der Merkle-Baum — Zugehörigkeit ohne Liste

Alle jemals erzeugten Commitments sind Blätter eines **Merkle-Baums** fester Tiefe (Tiefe 20 → bis
zu 2²⁰ ≈ 1,05 Millionen Notes). Die einzelne 32-Byte-**Wurzel** fasst die gesamte Menge zusammen.

Um eine Note auszugeben, beweisen Sie in Zero Knowledge, dass ihr Commitment ein Blatt unter der
aktuellen Wurzel ist — *ohne zu verraten, welches Blatt*. So prüft der Pool „diese Note existiert
wirklich und ist nicht ausgegeben", ohne je zu erfahren, welche Note Sie meinen.

```
                root
               /    \
            H(·,·)   H(·,·)
            /   \     /   \
          C0    C1  C2    C3   …   (your note is one of these — but which is hidden)
```

## Nullifier — genau einmal ausgeben

Würden Commitments einfach als „ausgegeben" markiert, gäbe das preis, welche Note bewegt wurde.
Stattdessen gibt das Ausgeben einer Note ihren **Nullifier** preis:

```
nf = H(C, leafIndex, sig)      where  sig = H(privKey, C, leafIndex)
```

Der Nullifier ist für eine gegebene Note an einer gegebenen Position deterministisch, aber ohne den
privaten Schlüssel **nicht mit ihrem Commitment verknüpfbar**. Der Contract führt eine globale
**Nullifier-Menge**; eine Transaktion, deren Nullifier bereits vorhanden ist, wird abgelehnt. Also:

- Sie können eine Note **einmal** ausgeben (ihr Nullifier kann nur einmal veröffentlicht werden).
- Niemand kann erkennen, *welchem* Commitment ein Nullifier entspricht.
- Die Menge ist **global über alle Lanes**, sodass Sie nicht durch ein Wettrennen zweier Lanes doppelt ausgeben können.

## Off-chain-Merkle-Einfügung

Zwei neue Commitments in einen Merkle-Baum einzufügen bedeutet normalerweise, Hashes im Baum
**on-chain** neu zu berechnen — teuer, weil das Hashing den Gasverbrauch dominiert. Cloister
verlagert diese Arbeit in den Beweis.

Die Schaltung beweist zwei Dinge über den Einfügeplatz:

1. der Platz war zuvor **leer** — `climb(emptyLeaf, slot, siblings) == oldRoot`, und
2. das Einfügen des neuen Paares ergibt die neue Wurzel — `climb(pairNode, slot, siblings) == newRoot`,
   unter Verwendung *desselben* Geschwisterpfades.

Sowohl `oldRoot` als auch `newRoot` sind öffentliche Ausgaben des Beweises. Der Contract prüft
schlicht den Beweis und speichert `newRoot` — er führt **überhaupt kein Poseidon-Hashing** durch.
Ergebnis: **≈350k Gas pro Zahlung statt ≈1,74M — rund 5× günstiger.** Eine Fälschung erforderte eine
Poseidon2-Second-Preimage, was undurchführbar ist.

## Lanes — Parallelität

Eine einzelne Wurzel ist ein Engpass: jede Zahlung verändert sie, sodass zwei Zahlungen im selben
Block kollidieren (die zweite sieht eine veraltete Wurzel). Cloister führt **mehrere unabhängige
Lanes**, jede mit eigener Merkle-Wurzel, während alle Lanes **eine globale Nullifier-Menge** teilen.

- Unabhängige Wurzeln → mehrere Zahlungen werden **parallel, im selben Block** abgewickelt. Der PoC
  brachte **6 von 6** gleichzeitig durch.
- Eine gemeinsame Nullifier-Menge → Sie können weiterhin nicht über Lanes hinweg doppelt ausgeben; die Sicherheit bleibt gewahrt.

## Das Compliance-Gate

Der Pool speichert außerdem die **Association-Root** — die Wurzel des Compliance-Good-Sets. Jede
echte Input-Note muss ihre Zugehörigkeit dazu beweisen, sodass nur geprüfte Mittel ausgegeben werden
können. Dies wird ausführlich behandelt unter [Association-Sets & Compliance](concept-association.html).

## Alles zusammengesetzt

Ein `transact`-Aufruf trägt: eine Merkle-`Root`, gegen die bewiesen wird, zwei `InputNullifier`,
zwei `OutputCommitment`, eine `NewRoot`, den Einfügeplatz, die `AssociationRoot`, den externen
Nettobetrag (für Ein-/Auszahlungen) und einen Hash, der Empfänger/Relayer/Gebühr bindet. Der
Contract leitet diese öffentlichen Signale neu ab, ruft den Verifier auf und gibt bei Erfolg die
Nullifier aus, emittiert die Commitments und schreibt die Lane-Wurzel fort. Die vollständige Liste
sind die
[öffentlichen Signale der Schaltung](circuit.html#public-signals-this-exact-order-matches-the-on-chain-verifier-pub-10).

Weiter: [Mittel abschirmen](concept-shield.html) — wie Werte in den Pool gelangen.
