# Viewing-Keys & Offenlegung

Privatsphäre, die sich nicht selektiv aufheben lässt, ist für ein reguliertes Unternehmen nutzlos —
Sie müssen Ihre eigene Historie gegenüber einer Bank, einem Auditor oder einer Steuerbehörde
nachweisen können. Cloister löst dies mit **Viewing-Keys**: kryptografischen Schlüsseln, die
**lesenden**, **abgegrenzten** Einblick in Transaktionen gewähren, ohne jemals die Möglichkeit zum
Ausgeben zu verleihen.

## Zwei Arten von Schlüsseln

Cloister trennt die Befugnis zum *Ausgeben* von der Befugnis zum *Sehen*:

- **Spend-Key** — autorisiert Zahlungen. Erforderlich, um Mittel zu bewegen. Wird nie geteilt.
- **Viewing-Key** — entschlüsselt die Memos der Transaktionen in seinem Geltungsbereich und enthüllt
  Beträge und Gegenparteien. Kann mit einem Auditor geteilt werden. **Kann nichts ausgeben.**

Beide werden deterministisch aus einem Seed abgeleitet (siehe [Schlüssel &
Wiederherstellung](concept-keys.html)), sodass ein einziges Backup alles wiederherstellt und ein
Viewing-Key übergeben werden kann, ohne den Spend-Key preiszugeben.

## Wie Offenlegung funktioniert

Jede Output-Note trägt ein **verschlüsseltes Memo** (eine `nacl box`, x25519), das die Note
beschreibt — Betrag, Blinding, Eigentümerschaft — und nur für Inhaber des passenden Viewing-Keys
lesbar ist. Zur Offenlegung:

1. Der Inhaber leitet einen Viewing-Key ab, der auf das beschränkt ist, was offengelegt werden soll
   (z. B. alle eigenen Transaktionen oder eine bestimmte Teilmenge).
2. Er übergibt diesen Schlüssel dem Auditor.
3. Der Auditor verwendet ihn, um genau jene Memos zu entschlüsseln — und sieht die echten Beträge
   und Gegenparteien — und **nichts anderes**. Er kann nichts ausgeben und keine Transaktionen
   außerhalb des Geltungsbereichs sehen.

Da die offengelegten Daten kryptografisch an die On-Chain-Commitments gebunden sind, kann der
Auditor überprüfen, dass sie für diesen Geltungsbereich **echt und vollständig** sind — der Inhaber
kann keine manipulierte Teilmenge vorzeigen.

## View-Tags — Erkennung ohne Scannen

Memos tragen außerdem ein 1 Byte großes **View-Tag**. Eine Wallet prüft zuerst das Tag und verwirft
etwa 255 von je 256 Notes, die nicht ihre eigenen sind, **ohne sie zu entschlüsseln**. Nur der
seltene Kandidat wird entschlüsselt. Das bedeutet:

- Das Erkennen Ihrer eingehenden Zahlungen ist **schnell** und skaliert mit der Pool-Größe.
- Ihre Scan-Kosten verraten nicht, *welche* Notes Ihnen gehören.

## Selektiv, nicht alles-oder-nichts

Der Sinn von Viewing-Keys ist **Granularität**. Eine Offenlegung ist ein Schlüssel, den Sie bewusst
übergeben, abgegrenzt auf einen Zweck:

| Szenario | Was Sie offenlegen | Was privat bleibt |
|---|---|---|
| Steuererklärung | Ihre eigene vollständige Historie für einen Zeitraum | alles von allen anderen |
| Bank-Herkunftsnachweis | die Spur der betreffenden Mittel | Ihre unabhängigen Guthaben/Zahlungen |
| Internes DAO-Audit | die Transaktionen der Treasury | die persönlichen Wallets der Mitglieder |
| Alltag | nichts | alles |

Sie werden niemals zu einer Alles-oder-nichts-Transparenz gezwungen. Der Standard ist Privatsphäre;
die Offenlegung ist bewusst, abgegrenzt und in der Praxis widerrufbar (Sie teilen einfach nicht
erneut, und Sie können Schlüssel rotieren).

## Was ein Viewing-Key nicht kann

- Er **kann nicht ausgeben** — er ist konstruktionsbedingt nur lesend.
- Er **kann seinen eigenen Geltungsbereich nicht erweitern** — er entschlüsselt nur Memos, für deren
  Abdeckung er abgeleitet wurde.
- Er **kann nichts fälschen** — offengelegte Daten sind gegen die On-Chain-Commitments überprüfbar.

## Vertrauensgrenzen im Überblick

| Partei | Sieht mit einem Viewing-Key | Erhält nie |
|---|---|---|
| Sie (Inhaber) | alles, was Ihnen gehört | — |
| Autorisierter Auditor | genau die abgegrenzte Historie | Ausgabebefugnis; Daten außerhalb des Geltungsbereichs |
| Jeder ohne den Schlüssel | nur opake Commitments | Beträge, Gegenparteien, Guthaben |

Weiter: [Schlüssel & Wiederherstellung](concept-keys.html) — woher diese Schlüssel stammen.
