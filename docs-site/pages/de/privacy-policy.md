# Datenschutzerklärung

Diese Erklärung beschreibt, wie die **Dokumentationsseite des Cloister Protocol** und die Referenzanwendungen mit
Daten umgehen. Sie ist vom *Privatsphäre-Modell* des Protokolls (was die Chain offenlegt) zu unterscheiden, das
unter [Privatsphäre-Modell](privacy.html) dokumentiert ist.

> Dies ist ein Proof-of-Concept-Projekt. Diese Seite beschreibt die aktuelle Praxis für die
> Dokumentations- und Demo-Oberflächen und wird vor jedem Produktivstart zu einer vollständigen rechtlichen Datenschutzerklärung erweitert.

## Diese Dokumentationsseite

Die Doku-Seite (`docs.cloister-protocol.com`) ist eine Sammlung **statischer Seiten**. Sie erfordert kein
Konto, betreibt keine Drittanbieter-Werbung oder seitenübergreifenden Tracker und verkauft keine Daten. Grundlegende
Server-/CDN-Protokolle (z. B. IP-Adresse, User Agent, angeforderter Pfad) können vorübergehend verarbeitet werden, um Inhalte
auszuliefern und vor Missbrauch zu schützen, wie es bei jedem Webhost üblich ist.

## Die Referenz-Konsole (App)

Die Referenz-Webanwendung unter `app.cloister-protocol.com` ist **self-custodial**:

- **Schlüssel und Beweiserstellung bleiben bei Ihnen.** Private Schlüssel, Beträge, Guthaben und der Proving-*Witness* werden
  auf Ihrem Gerät verarbeitet und **niemals** an Cloister-Server übertragen. Siehe
  [Schlüssel & Wiederherstellung](concept-keys.html).
- **Relayer.** Wenn Sie eine Zahlung einreichen, erhält der Relayer nur den fertigen Zero-Knowledge-
  Beweis und die öffentlichen Calldata – niemals Ihre Schlüssel oder den Witness. Siehe [Private Zahlungen](concept-pay.html).
- **On-Ramp / KYC.** Wenn Sie einen integrierten On-Ramp (z. B. einen regulierten Anbieter) zum Erwerb von Mitteln nutzen, führt dieser Anbieter
  die KYC-Prüfung durch und verarbeitet Ihre Identitätsdaten nach **seiner eigenen** Datenschutzerklärung und als der maßgebliche
  Verantwortliche. Cloister erhält oder speichert diese KYC-Daten nicht.
- **Demo-Modus.** Das Demo-Backend der Konsole verwendet **Beispieldaten** und Test-Token; es sind keine echten Mittel oder
  personenbezogenen Daten beteiligt.

## On-Chain-Daten

Transaktionen, die Sie auf einer Blockchain durchführen, sind naturgemäß **öffentlich und dauerhaft**. Cloister minimiert,
was offengelegt wird (siehe [Privatsphäre-Modell](privacy.html)), doch die Existenz von Shielded-Transaktionen und
die Beträge, die bei Ein-/Auszahlungen die Pool-Grenze überschreiten, sind On-Chain sichtbar und können nicht
gelöscht werden. Bedenken Sie dies, bevor Sie Transaktionen durchführen.

## Ihre Wahlmöglichkeiten

Da das Protokoll self-custodial und die Doku-Seite statisch ist, gibt es kein Konto zu löschen
und kein hier über Sie geführtes Profil. Für Daten, die von einem integrierten On-Ramp-/KYC-Anbieter verarbeitet werden, machen Sie
Ihre Rechte direkt bei **diesem Anbieter** geltend.

## Kontakt

Fragen zu dieser Erklärung oder zum Umgang mit Daten: die Maintainer des Projekts – siehe das
[Impressum](imprint.html) für Kontaktdetails. Diese Erklärung kann aktualisiert werden, während sich das Projekt der
Produktion nähert.
