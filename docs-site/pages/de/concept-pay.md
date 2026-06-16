# Private Zahlungen

Eine private Zahlung bewegt Werte **innerhalb** des Pools von einer Menge von Notes zu einer anderen,
ohne den Zahler, den Betrag oder die Verbindung zum Empfänger preiszugeben. Diese Seite zeichnet
genau nach, wie eine solche Zahlung funktioniert und warum jeder Baustein nötig ist.

## Die Form einer Zahlung

Jede Cloister-Zahlung ist eine **2-in/2-out**-Transaktion:

- **Inputs:** bis zu zwei Ihrer bestehenden Notes (eine kleinere Zahlung nutzt eine echte Note und
  einen *Dummy* mit dem Wert null).
- **Outputs:** genau zwei neue Notes — eine für den **Empfänger**, eine **Wechselgeld**-Note zurück an Sie.

Der Wert bleibt erhalten: `Σ inputs = Σ outputs + externalAmount + fee`. Bei einem internen Transfer
ist der externe Betrag null, sodass **keine Token on-chain bewegt werden** — nur Commitments und
Nullifier ändern sich, und der Betrag bleibt vollständig verborgen.

## Schritt für Schritt

Nehmen wir **Alice zahlt Bob 1.000 USDC** aus einer Note über 5.000 USDC:

1. **Den Witness erstellen.** Alices Wallet sammelt die privaten Daten: Betrag, Schlüssel und
   Blinding ihrer Note, ihren Merkle-Pfad, den Empfängerschlüssel und die Aufteilung (1.000 an Bob,
   4.000 Wechselgeld). Dies ist der *Witness* — und er **verlässt nie ihr Gerät**.
2. **On-Device beweisen.** Der native Prover erzeugt einen Groth16-**zk-SNARK** (im Sub-Sekunden-
   Bereich), der alles Folgende in Zero Knowledge bezeugt:
   - die Input-Note existiert unter der aktuellen Merkle-`Root` (Zugehörigkeit),
   - sie gehört zum Compliance-Good-Set (`AssociationRoot`),
   - der Wert bleibt im Gleichgewicht,
   - der **Nullifier** des Inputs ist korrekt abgeleitet (sodass er einmal ausgegeben werden kann),
   - die beiden Output-Commitments sind korrekt gebildet,
   - und die Merkle-Wurzel schreibt korrekt fort (Off-chain-Einfügung).
3. **Über einen Relayer einreichen.** Die Wallet sendet den fertigen Beweis + Calldata an einen
   **reinen Broadcast-Relayer**. Der Relayer zahlt das Gas und ist `msg.sender`, sodass **Alices
   Adresse nie erscheint.** Er sieht stets nur den öffentlichen Beweis — nie den Witness.
4. **Verifizieren & abwickeln.** Der Pool-Contract leitet die öffentlichen Signale neu ab, führt den
   Verifier aus und bei Erfolg: vermerkt er den Input-Nullifier als ausgegeben, emittiert die beiden
   neuen Commitments und schreibt die Lane-Wurzel fort.
5. **Der Empfänger entdeckt.** Jeder Output trägt ein verschlüsseltes Memo mit einem **View-Tag**;
   Bobs Wallet findet seine Note über 1.000 USDC (siehe [Viewing-Keys & Offenlegung](concept-viewing-keys.html)),
   und Alices Wallet greift die Wechselgeld-Note über 4.000 USDC auf.

## Was ein Beobachter sieht

Für jeden, der die Chain beobachtet, ist die Zahlung: *eine abgeschirmte Transaktion hat
stattgefunden.* Zwei undurchsichtige Commitments sind erschienen, ein undurchsichtiger Nullifier
wurde ausgegeben. Kein Zahler, kein Empfänger, kein Betrag, kein Saldo — und keine Möglichkeit, dies
mit Alices früherer Einzahlung zu verknüpfen.

| Verborgen | Sichtbar |
|---|---|
| welcher Input welchen Output finanziert hat | dass *eine* abgeschirmte Tx stattfand |
| Note-Beträge, -Inhaber | die neuen (undurchsichtigen) Commitments |
| Verknüpfung Zahler ↔ Empfänger | die ausgegebenen (undurchsichtigen) Nullifier |
| Ihr Saldo | Token netto rein/raus **nur** bei Ein-/Auszahlungen |

## Warum ein Relayer?

Zwei Gründe. **Privatsphäre:** würde Alice die Transaktion selbst einreichen, wäre sie `msg.sender`
und verknüpfte ihre Adresse wieder mit der Zahlung — was den Sinn zunichtemacht. Dass der Relayer der
Absender ist, bricht diese Verbindung auf. **Verfügbarkeit:** Alice hält womöglich keinen
Gas-Token; der Relayer zahlt das Gas für sie. Der Relayer kann keine Mittel stehlen oder umleiten —
Empfänger, Gebühr und Beträge sind über `ExtDataHash` allesamt in den Beweis gebunden, sodass eine
Änderung daran ihn ungültig macht. Falls Relayer zensieren, existiert ein opt-in-basierter
Direct-RPC-Fallback (er tauscht Absender-Privatsphäre gegen Verfügbarkeit und ist **standardmäßig
aus**). Siehe [Fallbacks & Resilienz](fallbacks.html).

## Auszahlen

Eine **Auszahlung** ist das Spiegelbild des Abschirmens: Sie beweisen das Eigentum an In-Pool-Notes,
und der Pool gibt Token an eine gewählte Adresse frei. Hier *ist* der Betrag sichtbar (Token
überqueren erneut die Grenze), aber die Verbindung zu Ihrer vorherigen In-Pool-Aktivität bleibt
verborgen. Interne Zahlungen und Auszahlungen teilen dieselbe Schaltung; nur der externe Betrag
unterscheidet sich.

## Gebühren

Eine Zahlung kann eine Gebühr enthalten, die an den Relayer für das Gas + den Service gezahlt wird.
Die Gebühr ist Teil der Wertehaltungsgleichung und in den Beweis gebunden, sodass sie nachträglich
nicht aufgebläht werden kann.

Weiter: [Association-Sets & Compliance](concept-association.html) — wie „saubere Herkunft" bewiesen wird.
