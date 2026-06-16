# Cloister Protocol

> Eine compliante Privacy-Schicht für Stablecoin-Zahlungen auf jeder EVM-Chain.

Öffentliche Blockchains sind radikal transparent. Jeder Stablecoin-Transfer legt dauerhaft den
Absender, den Empfänger, den Betrag und – über die jeweilige Adresse – das gesamte Guthaben sowie
die komplette Transaktionshistorie des Absenders für alle Welt offen. Für ein Gehalt, eine Rechnung,
eine Lieferantenzahlung oder einen Treasury-Transfer ist das untragbar. Es ist so, als würde jede
Banküberweisung in der Zeitung von morgen abgedruckt – und das für immer.

Cloister behebt genau das. Es ist ein **abgeschirmter Zahlungspool**, der die On-Chain-Verbindung
zwischen einer Wallet und einer Zahlung auftrennt. Sobald Gelder in den Pool eingehen, erfährt
niemand – weder der Händler noch ein On-Chain-Beobachter, nicht einmal der Relayer, der die
Transaktion verbreitet – die Adresse des Zahlenden oder kann daraus dessen Guthaben und Vermögen
ableiten.

## Privatsphäre *mit* Rechenschaftspflicht – kein Mixer

Das Schwierige ist, dies zu erreichen, **ohne** zu einem Geldwäsche-Werkzeug zu werden. Anonyme
Mixer lösen das Privatsphäre-Problem und ignorieren Compliance; genau deshalb werden sie sanktioniert
und kann sie kein reguliertes Unternehmen anfassen. Cloister verfolgt den gegenteiligen Ansatz:

- Gelder können nur über einen **geprüften, KYC-verifizierten** On-Ramp in den Pool gelangen. Der
  Eintrittspunkt ist der eine öffentliche Berührungspunkt – und er ist kontrolliert.
- Jede private Auszahlung trägt einen **Zero-Knowledge-Beweis**, dass die ausgegebenen Gelder zu einem
  kuratierten Compliance-Good-Set gehören (dem *Association-Set-Provider*, ASP) – und belegt damit,
  dass das Geld sauber ist, **ohne zu verraten, aus welcher Einzahlung es stammt**.
- **Viewing Keys** erlauben es dem Inhaber – oder einem autorisierten Auditor, einer Bank oder einer
  Steuerbehörde – auf Anfrage selektiv eine bestimmte Transaktionshistorie offenzulegen, während alles
  Übrige privat bleibt.

So kann ein Nutzer privat bleiben **und** gegenüber einer Aufsichtsbehörde einen sauberen Ursprung
nachweisen. Genau darum geht es: *Privatsphäre ist der Standard, Offenlegung ist ein Schlüssel, den
Sie selbst halten.* Das macht Cloister zu einem Produkt, das ein reguliertes Unternehmen ausliefern kann.

## Was es ist, in einem Absatz

Sie schirmen Gelder einmalig in den Pool ab (öffentlich, geprüft). Von da an existiert Ihr Guthaben
als **verschlüsseltes Commitment** – ein Hash, der nichts preisgibt. Um zu zahlen, erstellt Ihr
Gerät einen **zk-SNARK**, der beweist, dass Sie über genügend saubere Gelder verfügen und den Transfer
autorisieren; ein **Broadcast-only-Relayer** reicht ihn ein und zahlt das Gas, sodass Ihre Adresse nie
On-Chain erscheint. Der Empfänger entdeckt seine eingehende Note privat. Keine Adressverknüpfung, kein
sichtbarer Betrag, kein durchgesickertes Guthaben – aber darunter eine beweisbare, auditierbare Spur
sauberen Ursprungs.

## Auf einen Blick

- **Privatsphäre als Standard** – die Adresse des Zahlenden erscheint nie als Transaktionsabsender oder in den Calldata.
- **Compliance by Design** – nur geprüfte Gelder werden zugelassen; Viewing Keys geben autorisierten Auditoren eine selektive, zeitlich begrenzte Offenlegung.
- **Jede EVM-Chain** – identische Contracts und einmalig kompilierte Circuits lassen sich auf jeder EVM-L2 ausrollen (Base, Polygon, Arbitrum, …).
- **Self-Custodial** – das Beweisen geschieht auf Ihrem Gerät; private Schlüssel, Beträge und Guthaben verlassen es nie.
- **~5× günstiger** – die Off-Chain-Merkle-Einfügung bringt eine abgeschirmte Zahlung auf ≈350k Gas statt ≈1,74M.
- **Für Entwickler gebaut** – eine offene, additive HTTP-API + SDK; jede Wallet oder jeder PSP kann integrieren, ohne Lock-in.

## Wo Sie anfangen sollten

| Wenn Sie … möchten | Lesen Sie |
|---|---|
| die Zahlung in vier Schritten verstehen | **[Wie es funktioniert](how-it-works.html)** |
| konkrete Anwendungsfälle sehen | **[Warum Cloister](why-cloister.html)** |
| die einzelnen Bausteine verstehen | **[Der abgeschirmte Pool](concept-pool.html)** und den Abschnitt „Kernkonzepte" |
| das tiefe Design lesen | **[Architektur](architecture.html)** und die **[Circuit-Spezifikation](circuit.html)** |
| es integrieren | **[Integrationsleitfaden](integration.html)** |
| einfach Antworten erhalten | **[FAQ](faq.html)** und **[Glossar](glossary.html)** |

> **Status – Proof of Concept.** Die Contracts und der Circuit wurden in einem internen
> adversariellen Audit gehärtet. Externe Audits und eine produktive Multi-Party-Trusted-Setup-Zeremonie
> stehen noch aus, bevor ein Mainnet-Deployment erfolgt. Siehe den **[Disclaimer](disclaimer.html)**.
