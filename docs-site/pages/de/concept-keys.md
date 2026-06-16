# Schlüssel & Wiederherstellung

Cloister ist **selbstverwahrend**: Sie halten die Schlüssel, und die sensibelste Operation — das
Beweisen — geschieht auf Ihrem eigenen Gerät. Diese Seite erläutert die Schlüsselhierarchie, wie die
Wiederherstellung funktioniert und warum das Design eine ganze Klasse kryptografischer Fehler
ausschließt.

## Ein Seed, viele Schlüssel

Alles wird deterministisch aus einem einzigen **Seed** abgeleitet (einer standardmäßigen
BIP39-Mnemonik, dieselbe Art von Backup-Phrase, die eine normale Krypto-Wallet verwendet). Daraus
leitet Cloister ab:

```
seed
 ├─ spend key      → authorizes payments (privKey)
 │    └─ pubKey = H(privKey)        (your address inside the pool)
 ├─ viewing key    → read-only disclosure of your transactions
 └─ encryption key → decrypts incoming note memos (x25519)
```

Da alle Schlüssel aus einem Seed stammen, **stellt ein einziges Backup Ihre gesamte Pool-Historie
und Ihr Guthaben wieder her** — es gibt kein separates Geheimnis pro Note, das verloren gehen
könnte. Stellen Sie die Mnemonik auf einem neuen Gerät wieder her, und die Wallet leitet jeden
Schlüssel neu ab, scannt die Chain erneut und baut Ihre Notes wieder auf.

## Kurvenfreie Schlüssel — `pubKey = H(privKey)`

Die meisten Shielded-Pool-Designs bauen Schlüssel auf einer elliptischen Kurve auf (z. B.
BabyJubJub). Cloister verwendet stattdessen einen **kurvenfreien** Schlüssel: Ihr öffentlicher
Schlüssel ist schlicht der Hash Ihres privaten Schlüssels, `pubKey = H(privKey)`, mit Poseidon2.

Dies ist eine bewusste Sicherheitsentscheidung. Kurvenbasierte Note-Schemata bergen eine subtile,
gut bekannte Klasse von Self-Double-Spends, die an die Subgruppenordnung der Kurve gebunden ist —
ein Angreifer, der die Skalararithmetik versteht, kann mitunter zwei gültige Nullifier für eine Note
herstellen. Indem Cloister die **Kurve vollständig entfernt**, schließt es diese gesamte Fehlerklasse
strukturell aus: Es gibt keinen Skalar, keine Subgruppenordnung, nichts auszunutzen. Zugleich macht
es die Schaltung kleiner und denselben Hash nativ wie auch in-circuit nutzbar.

## Ausgeben vs. Sehen — durch Design getrennt

Der Spend-Key und der Viewing-Key sind aus gutem Grund unterschiedliche Schlüssel
([Viewing-Keys & Offenlegung](concept-viewing-keys.html)):

- Teilen Sie Ihren **Viewing-Key** mit einem Auditor → er kann die abgegrenzte Historie *lesen*,
  niemals ausgeben.
- Ihr **Spend-Key** verlässt niemals das Gerät und wird niemals geteilt.

Diese Trennung macht eine compliancekonforme Offenlegung sicher: Sie können Ihre Historie nachweisen,
ohne jemals Ihre Mittel zu riskieren.

## On-Device-Proving — der Kern der Privatsphäre

Wenn Sie zahlen, stellt Ihre Wallet einen **Witness** zusammen (private Schlüssel, Beträge,
Blindings, Merkle-Pfade), und der **native Prover** erstellt den Zero-Knowledge-Beweis **auf dem
Gerät**. Der Witness verlässt das Telefon nie; der Relayer und die Chain sehen nur den fertigen
Beweis.

> Ein reiner Entwicklungs-HTTP-Prover (`proverd`) existiert für CI und lokale Tests und sieht den
> Witness **sehr wohl** — genau deshalb darf er niemals als Produktionspfad verwendet werden.
> Produktiv-Wallets nutzen ausschließlich den nativen On-Device-Prover. Siehe
> [Privatsphärenmodell](privacy.html).

## Checkliste zur Wiederherstellung

| Sie haben | Sie können wiederherstellen |
|---|---|
| die Seed-Phrase | Spend- + Viewing- + Encryption-Keys → vollständiges Guthaben & Historie |
| nur einen Viewing-Key | lesende Sicht auf die abgegrenzten Transaktionen (kein Ausgeben) |
| nichts | nichts — es gibt keine Hintertür eines Verwahrers (das ist der Sinn der Selbstverwahrung) |

Hüten Sie die Seed-Phrase wie bei jeder Krypto-Wallet: Sie ist die einzige Wurzel sowohl Ihrer Mittel
als auch Ihrer Privatsphäre.

Weiter: die [Architektur](architecture.html) für das vollständige Systemdesign oder die
[FAQ](faq.html).
