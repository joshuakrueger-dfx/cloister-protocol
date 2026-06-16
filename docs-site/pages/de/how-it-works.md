# Wie es funktioniert

Ein abgeschirmter, verschlüsselter Pool: einmal einzahlen, dann so oft privat bezahlen, wie Sie
möchten, On-Chain abwickeln und dabei nie die Identität des Zahlenden preisgeben – während eine
beweisbare Spur sauberen Ursprungs erhalten bleibt.

Diese Seite begleitet eine Zahlung über ihren gesamten Lebenszyklus. Wir nutzen ein durchgängiges
Beispiel: **Alice zahlt Bob 1.000 USDC** für eine Rechnung.

## Die vier Schritte

### 1 · Shield – der eine öffentliche Berührungspunkt

Alice lädt einmalig Gelder in den Pool. Dies ist der **einzige** Moment, in dem ihre Identität und der
Betrag öffentlich sind, und er ist bewusst kontrolliert: **KYC, Sanktionsprüfung und Geofencing laufen
hier**. Sie zahlt beispielsweise 5.000 USDC ein.

On-Chain erzeugt die Einzahlung ein **verschlüsseltes Commitment** – `C = H(amount, pubKey, blinding)`,
einen Poseidon2-Hash. Es beweist, dass eine Note existiert, ohne deren Betrag oder Eigentümer
preiszugeben. Von diesem Punkt an existieren Alices 5.000 USDC innerhalb des Pools als undurchsichtige
Hashes, nicht als sichtbares Guthaben auf ihrer Adresse.

> Stellen Sie sich das Abschirmen so vor, als würden Sie Geld auf ein Nummernkonto überweisen, dessen
> Kontoauszüge nur Sie lesen können. Die Überweisung ist sichtbar; alles danach ist es nicht.

### 2 · Privat zahlen – ein Beweis, keine Überweisung

Um Bob 1.000 USDC zu zahlen, erstellt Alices Wallet einen **Zero-Knowledge-Beweis** auf ihrem Gerät.
Der Beweis bestätigt, ohne eine der zugrunde liegenden Werte preiszugeben, dass:

- sie Input-Notes im Wert von mindestens 1.000 USDC besitzt, die im Pool existieren,
- diese Notes zum Compliance-Good-Set gehören (sauberer Ursprung),
- die Rechnung aufgeht: `inputs = outputs + payment + fee`,
- und die Notes nicht zuvor ausgegeben wurden (ein eindeutiger *Nullifier* wird offengelegt).

Das Ergebnis sind zwei neue Commitments – eine 1.000-USDC-Note für Bob, eine 4.000-USDC-„Wechselgeld"-Note
zurück an Alice – plus ein verschlüsseltes Memo, das Bob finden kann. **Keine Adresse, kein Betrag, kein
Guthaben** wird offengelegt. Die interne Zahlung ist eine verschlüsselte Note, kein sichtbarer
ERC-20-`transfer`.

### 3 · Off-Chain-Einfügung – günstig abwickeln

Ein **Broadcast-only-Relayer** empfängt den fertigen Beweis samt Calldata, zahlt das Gas und reicht die
Transaktion ein. Weil der Relayer `msg.sender` ist, **erscheint Alices Adresse nie On-Chain.**

Der Pool-Contract verifiziert den Beweis und aktualisiert seinen Merkle-Baum. Der raffinierte Teil: die
neue Tree-Root wird **innerhalb des Circuits bewiesen**, sodass der Contract *kein* On-Chain-Hashing
durchführt. Das senkt die Kosten von ≈1,74M Gas auf **≈350k Gas – etwa 5× günstiger**. (Siehe
[Off-Chain-Einfügung](concept-pool.html#off-chain-merkle-insertion).)

### 4 · Discover – Bob findet sein Geld, privat

Der Indexer beobachtet die neuen Commitments. Jeder Output trägt ein verschlüsseltes Memo mit einem
1-Byte-**View-Tag**. Bobs Wallet prüft die Tags und verwirft ~255/256 der Notes anderer Personen sofort,
indem sie nur den Kandidaten entschlüsselt, der tatsächlich seiner ist. Er erfährt, dass er 1.000 USDC
erhalten hat; niemand sonst tut das – und niemand erfährt, dass es von Alice kam.

Für jeden, der die Chain beobachtet, ist nur Folgendes geschehen: *irgendeine* abgeschirmte Transaktion
fand statt, zwei undurchsichtige Commitments tauchten auf, zwei undurchsichtige Nullifier wurden
ausgegeben. Der Zahlende, der Empfänger, der Betrag und die Verbindung zwischen ihnen bleiben allesamt
verborgen.

## Was jede Partei sieht

| Partei | Sieht | Sieht **nicht** |
|---|---|---|
| On-Chain-Beobachter | dass eine abgeschirmte Tx stattfand; undurchsichtige Commitments + Nullifier | Zahlenden, Empfänger, Betrag, Guthaben |
| Der Relayer | den fertigen Beweis + öffentliche Calldata | private Schlüssel, Beträge, wer Alice ist |
| Bob (Empfänger) | die an ihn adressierte 1.000-USDC-Note | Alices Adresse oder ihre übrigen Guthaben |
| Ein autorisierter Auditor (mit Viewing Key) | genau die Historie, die der Schlüssel freigibt | alles außerhalb des Geltungsbereichs dieses Schlüssels |

## Parallelität – viele Zahlungen pro Block

Ein naiver abgeschirmter Pool serialisiert: jede Transaktion verändert die einzige Merkle-Root, sodass
zwei Zahlungen im selben Block in Konflikt geraten. Cloister betreibt **unabhängige Lanes**, jede mit
ihrer eigenen Root, die sich aus Sicherheitsgründen ein globales Nullifier-Set teilen. Im PoC landeten
**6 von 6 Zahlungen parallel im selben Block**. (Siehe [Der abgeschirmte Pool → Lanes](concept-pool.html#lanes-parallelism).)

---

Das ist der gesamte Ablauf. Die Privatsphäre stammt aus der Zero-Knowledge-Note-Schicht; die Compliance
stammt aus der [Association-Set-Zugehörigkeit](concept-association.html) und den
[Viewing Keys](concept-viewing-keys.html). Lesen Sie als Nächstes den Abschnitt „Kernkonzepte" oder
springen Sie direkt zur [Architektur](architecture.html).
