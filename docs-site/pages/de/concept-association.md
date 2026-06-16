# Association-Sets & Compliance

Dies ist die Seite, die Cloister von einem Mixer unterscheidet. Ein **Association-Set** (oder
Compliance-Good-Set) ist die kuratierte Menge an Einzahlungen, die nachweislich sauber sind. Jede
private Zahlung beweist, dass ihre Mittel zu dieser Menge gehören — **ohne zu verraten, welches
Mitglied es ist** — und so liefert das Protokoll Privatsphäre *und* nachweisbar sauberen Ursprung
zugleich.

## Die Idee

Wenn Sie über einen geprüften On-Ramp einzahlen ([Mittel abschirmen](concept-shield.html)), wird
Ihre Einzahlung dem **Good-Set** hinzugefügt, das von einem **Association-Set-Provider (ASP)**
gepflegt wird. Das Good-Set ist selbst ein Merkle-Baum, der durch eine **Association-Root**
zusammengefasst wird, die im Pool gespeichert ist.

Wenn Sie später eine Note ausgeben, verlangt die Schaltung von Ihnen den Nachweis — in Zero
Knowledge —, dass die ausgegebene Note von einer Einzahlung **innerhalb** dieses Good-Sets
abstammt. Konkret erzwingt die Schaltung für jeden echten Input:

```
climb(C, assocIndex, assocPath) == AssociationRoot
```

das heißt, das Commitment des Inputs ist ein Blatt unterhalb der Compliance-Root. Befinden sich die
Mittel nicht im Good-Set, **existiert kein gültiger Beweis** — die Zahlung kann nicht durchgeführt
werden.

## „Proof of Innocence", nicht „Proof of Identity"

Die entscheidende Eigenschaft: Der Beweis zeigt die Zugehörigkeit **ohne zu verraten, welches
Mitglied es ist**. Ein Beobachter — oder der ASP selbst — erfährt nur, dass die ausgegebenen Mittel
*irgendwo* in der sauberen Menge liegen, nicht welche Einzahlung, nicht von wem, nicht wie viel.

Dies wird mitunter als **Proof of Innocence** bezeichnet: Sie weisen nach, dass Ihr Geld nicht in
der „bösen" Menge liegt, ohne sich selbst zu deanonymisieren. Vergleichen Sie dies mit den beiden
Fehlermodi, die Cloister vermeidet:

| Ansatz | Privatsphäre | Compliance |
|---|---|---|
| Transparente Chain | keine | trivial, aber keine Privatsphäre |
| Anonymer Mixer | vollständig | keine — unbekannter Ursprung |
| **Cloister-Association-Set** | vollständig | nachweisbar sauberer Ursprung |

## Warum die Menge nur wächst

Das Good-Set ist **monoton** — Einzahlungen werden nur hinzugefügt, niemals entfernt. Das hat zwei
praktische Vorteile:

- **Alte Roots bleiben gültig.** Ein Beweis, der gegen die Association-Root der letzten Woche
  erstellt wurde, wird weiterhin akzeptiert, sodass Root-Aktualisierungen keine Beweise entwerten,
  die sich bereits in Bearbeitung befinden.
- **Keine Races.** Ein Nutzer, der die Zugehörigkeit beweist, gerät nicht mit dem ASP in ein Race,
  wenn dieser ein neues Mitglied hinzufügt; beides kann gleichzeitig und konfliktfrei geschehen.

(Muss eine Einzahlung nachträglich ausgeschlossen werden — z. B. bei einer revidierten Prüfung —,
geschieht dies durch Richtlinien beim ASP und vorausschauendes Root-Management, nicht durch das
stillschweigende Brechen bestehender Beweise.)

## Wer den ASP betreibt

Der ASP definiert und kuratiert die Compliance-Richtlinie — welche geprüften Einzahlungen ins
Good-Set aufgenommen werden. Im Referenzdesign betreibt ihn ein regulierter Betreiber, der dieselben
KYC/AML-Standards anwendet wie sein On-Ramp. Wichtig ist, dass die Macht des ASP **begrenzt** ist:

| Der ASP **kann** | Der ASP **kann nicht** |
|---|---|
| entscheiden, welche Einzahlungen ins Good-Set aufgenommen werden | Ihre Notes ausgeben |
| Compliance-Richtlinien definieren | Sie anhand von On-Chain-Daten deanonymisieren |
| aktualisierte Good-Set-Roots veröffentlichen | Ihr Guthaben sehen oder wen Sie bezahlen |

Der ASP kuratiert die Zulässigkeit; er hält niemals Mittel und sieht niemals den privaten Graphen.

## Wie dies einen Regulierer zufriedenstellt

Eine regulierte Einheit muss die Frage „Woher stammt dieses Geld?" beantworten können. Cloister
beantwortet sie auf zwei Ebenen:

1. **Systemisch** — jede Auszahlung im System trägt einen Beweis der Good-Set-Zugehörigkeit, sodass
   der Pool als Ganzes nicht mit ungeprüftem Geld finanziert werden kann.
2. **Spezifisch** — für ein einzelnes Audit ermöglichen [Viewing-Keys](concept-viewing-keys.html)
   dem Inhaber oder einem autorisierten Auditor, auf Anforderung eine präzise Transaktionsspur
   offenzulegen.

Zusammen bedeuten diese, dass ein Nutzer im Alltag vollständig privat sein und dennoch eine saubere,
prüfbare Ursprungsgeschichte vorlegen kann, wann immer dies berechtigt verlangt wird.

Weiter: [Viewing-Keys & Offenlegung](concept-viewing-keys.html).
