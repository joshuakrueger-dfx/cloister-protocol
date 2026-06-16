# Warum Cloister

Stablecoins werden zu echten Zahlungsschienen – für Gehälter, Rechnungen, Lieferantenabwicklung,
Treasury. Doch dieselbe Transparenz, die eine Blockchain vertrauenswürdig macht, macht sie für diese
Abläufe auch unbrauchbar: **jede Zahlung veröffentlicht Ihren Gegenpart, Ihren Betrag und Ihr gesamtes
Guthaben für alle Welt.** Cloister verleiht diesen Abläufen die Vertraulichkeit, die sie im klassischen
Bankwesen seit jeher hatten, und erhält zugleich die von Aufsichtsbehörden geforderte Auditierbarkeit.

## Das Problem, konkret

Auf einer öffentlichen Chain verrät eine Zahlung weit mehr als die Zahlung selbst:

- **Guthaben-Offenlegung** – wer Ihre Adresse erfährt, sieht Ihren gesamten Bestand und Ihr Vermögen.
- **Gegenpart-Graph** – jeder Lieferant, jeder Angestellte und jeder Partner, den Sie bezahlen, wird öffentlich und verknüpfbar.
- **Gehalts-Offenlegung** – zahlen Sie einem Angestellten einmal, und seine Adresse (und sein Gehalt) ist trivial nachverfolgbar.
- **Wettbewerbs-Leck** – Konkurrenten können Ihre Treasury-Bewegungen, Ihre Runway und Ihren Burn in Echtzeit beobachten.
- **Zielscheibe** – öffentlich sichtbarer Wohlstand lädt zu Phishing, Erpressung und physischen Risiken ein.

Unternehmen reagieren darauf, indem sie Stablecoins für nichts Sensibles **nicht** nutzen. Cloister
beseitigt den Hinderungsgrund, ohne die Rechenschaftspflicht zu beseitigen.

## Für wen es gedacht ist

### Payment-Service-Provider & Wallets
Bieten Sie private Stablecoin-Zahlungen als Funktion an. Cloister ist eine additive HTTP-API + SDK –
fügen Sie es neben einer bestehenden Schiene ein (OpenCryptoPay ist die erste Integration), ohne Lock-in
und ohne Änderung an der Art, wie Gelder verwahrt werden. Siehe [Integration](integration.html).

### Unternehmen, die Gehälter & Lieferanten zahlen
Bezahlen Sie Angestellte und Lieferanten in Stablecoins, ohne Ihre Gehaltsabrechnung oder Ihre
Lieferantenliste zu veröffentlichen. Der Gegenpart erhält die Gelder privat; Ihre Treasury-Adresse wird
nie mit der Zahlung verknüpft.

### Treasuries & DAOs
Bewegen Sie Gelder, balancieren Sie um und wickeln Sie ab, ohne Ihre Strategie an Konkurrenten und
Front-Runner zu senden – und können dennoch jeden Fluss gegenüber Auditoren und Mitgliedern per Viewing
Key nachweisen.

### Privatpersonen
Empfangen Sie ein Gehalt oder werden Sie bezahlt, ohne Ihre Adresse, Ihr Guthaben und Ihre Historie all
jenen offenzulegen, die Ihnen jemals Geld senden.

## Warum nicht einfach einen Mixer nutzen?

Mixer (und „Anonymitätspools" ohne Eintrittskontrolle) liefern Privatsphäre, indem sie Gelder
**unbekannten Ursprungs** akzeptieren. Genau das bringt sie unter Sanktionen und macht sie für jedes
regulierte Unternehmen radioaktiv. Cloister ist das gegenteilige Design:

| | Anonymer Mixer | **Cloister** |
|---|---|---|
| Eintritt | für jeden offen | KYC- + sanktionsgeprüfter On-Ramp |
| Herkunft der Gelder | unbekannt / nicht beweisbar | bewiesen ∈ Compliance-Good-Set, in Zero Knowledge |
| Auditierbarkeit | keine | selektive Offenlegung per Viewing Key |
| Regulatorische Haltung | sanktioniert | auf Compliance ausgelegt; ein Schweizer Produkt |
| Wer es ausliefern kann | kein Regulierter | Banken, PSPs, regulierte Wallets |

Cloister beweist den sauberen Ursprung, **ohne** den Nutzer zu deanonymisieren, und lässt den Nutzer
(oder einen autorisierten Auditor) eine **bestimmte** Historie offenlegen, **ohne** alles preiszugeben.
Privatsphäre und Compliance sind nicht länger ein Zielkonflikt.

## Was es nicht leistet

Cloister ist ehrlich in Bezug auf seine Grenzen:

- Es ist **kein** Weg, Gelder zu waschen – ungeprüftes Geld kann nicht eintreten und nicht als sauber bewiesen werden.
- Es verbirgt **nicht** die Einzahlungs-/Auszahlungsbeträge an der Pool-Grenze (Token überschreiten sie sichtbar);
  es verbirgt den *internen* Graphen. Siehe [Privacy-Modell](privacy.html).
- Es ist **kein** Verwahrer – Sie halten Ihre Schlüssel; das Beweisen geschieht auf Ihrem Gerät.

Als Nächstes: **[Wie es funktioniert](how-it-works.html)** für die Mechanik, oder die
**[FAQ](faq.html)** für direkte Antworten.
