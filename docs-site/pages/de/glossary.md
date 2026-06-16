# Glossar

Kurze Definitionen der in dieser Dokumentation verwendeten Begriffe. Die verlinkten Seiten gehen tiefer.

**Association Root** — die Merkle-Wurzel der Compliance-Good-Set, im Pool gespeichert. Jeder reale
Input muss die Zugehörigkeit zu ihr nachweisen. Siehe [Association Sets & Compliance](concept-association.html).

**Association-Set-Provider (ASP)** — die Partei, die die Good-Set kuratiert: welche geprüften Einzahlungen
zugelassen werden. Sie kann weder Mittel ausgeben noch Nutzer deanonymisieren.

**Blinding** — ein Zufallswert, der in ein Note-Commitment eingemischt wird, sodass zwei Notes mit demselben Betrag und
Eigentümer dennoch zu unterschiedlichen Commitments hashen.

**Commitment (`C`)** — `H(amount, pubKey, blinding)`. Die On-Chain-, undurchsichtige Repräsentation einer
Note. Offenbart ohne den Witness nichts. Siehe [Der Shielded Pool](concept-pool.html).

**Curve-free Key (kurvenfreier Schlüssel)** — Cloisters Schlüsselschema, `pubKey = H(privKey)`, ohne elliptische Kurve – das
strukturell eine Klasse von Self-Double-Spend-Bugs beseitigt. Siehe [Schlüssel & Wiederherstellung](concept-keys.html).

**ExtData / ExtDataHash** — externe Transaktionsdaten (Empfänger, Relayer, Gebühr, verschlüsselte Outputs)
und deren Hash, in den Beweis eingebunden, sodass sie nicht manipuliert werden können.

**Good-Set** — die Menge der Einzahlungen, die als sauber (geprüft) bekannt sind. Synonym für die Association Set.

**Groth16** — das von Cloister verwendete zk-SNARK-Beweissystem (über die BN254-Kurve), das kleine,
schnell verifizierbare Beweise liefert.

**Lane** — eine von mehreren unabhängigen Merkle-Wurzeln im Pool, die parallele Transaktionen in einem
einzigen Block ermöglichen. Siehe [Der Shielded Pool → Lanes](concept-pool.html#lanes-parallelism).

**Merkle-Baum** — der Baum fester Tiefe (2²⁰) aller Commitments; seine Wurzel fasst die Pool-
Zugehörigkeit zusammen, sodass die Existenz einer Note nachgewiesen werden kann, ohne preiszugeben, welche Note.

**Note** — eine Werteinheit im Pool (im UTXO-Stil): ein Betrag, der von einem Schlüssel gehalten wird. Wird in
2-in/2-out-Transaktionen ausgegeben und erzeugt. Siehe [Private Zahlungen](concept-pay.html).

**Nullifier (`nf`)** — `H(C, leafIndex, sig)`. Wird veröffentlicht, wenn eine Note ausgegeben wird; deterministisch je
Note, jedoch ohne den privaten Schlüssel nicht mit deren Commitment verknüpfbar. Verhindert Double-Spending.

**Off-Chain-Einfügung** — das Beweisen des Merkle-Wurzel-Übergangs innerhalb des Circuits, sodass der Vertrag
kein On-Chain-Hashing durchführt, was das Gas um ~5× reduziert. Siehe [Der Shielded Pool](concept-pool.html#off-chain-merkle-insertion).

**Poseidon2** — eine zk-freundliche Hash-Funktion, die sowohl nativ als auch im Circuit verwendet wird; derselbe Hash für
Schlüssel, Commitments, Nullifier und den Merkle-Baum.

**Proof of Innocence** — der Nachweis, dass Mittel zur Good-Set gehören, ohne offenzulegen, welches Mitglied –
saubere Herkunft ohne Deanonymisierung.

**Relayer** — ein reiner Broadcast-Dienst, der einen fertigen Beweis einreicht und Gas zahlt, sodass die Adresse des Nutzers
niemals der On-Chain-Absender ist. Kann weder den Witness sehen noch Mittel umleiten. Siehe
[Private Zahlungen](concept-pay.html#why-a-relayer).

**Shielding** — das Einzahlen von Mitteln in den Pool; der eine öffentliche, geprüfte Berührungspunkt. Siehe
[Mittel shielden](concept-shield.html).

**Spend Key** — der Schlüssel, der Zahlungen autorisiert. Wird niemals geteilt. Vom Viewing Key zu unterscheiden.

**View Tag** — ein 1-Byte-Hinweis auf jedem verschlüsselten Memo, der es einem Wallet erlaubt, ~255/256 der Notes
anderer zu überspringen, ohne sie zu entschlüsseln.

**Viewing Key** — ein schreibgeschützter Schlüssel, der die Memos in seinem Geltungsbereich für die selektive Offenlegung entschlüsselt;
kann nicht ausgeben. Siehe [Viewing Keys & Offenlegung](concept-viewing-keys.html).

**Witness** — die privaten Eingaben eines Beweises (Schlüssel, Beträge, Blindings, Merkle-Pfade). Verlässt
niemals das Gerät.

**Zero-Knowledge-Beweis (zk-SNARK)** — ein Beweis, dass eine Aussage wahr ist, ohne über ihre Wahrheit hinaus etwas
preiszugeben. Cloister verwendet ihn, um Zahlungen zu autorisieren und eine saubere Herkunft vertraulich nachzuweisen.
