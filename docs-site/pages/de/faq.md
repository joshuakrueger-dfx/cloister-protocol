# Häufig gestellte Fragen

## Was ist das Cloister Protocol?

Eine konforme Privatsphäre-Schicht für Stablecoin-Zahlungen auf EVM-Chains.
Es handelt sich um einen Shielded Pool, der die Adresse des Zahlers, den Betrag und die Verknüpfung zwischen Zahler und Empfänger verbirgt,
während er zugleich – in Zero Knowledge – nachweist, dass die Mittel sauber sind. Siehe die
[Einführung](index.html).

## Ist das ein Mixer?

Nein. Ein Mixer nimmt Mittel **unbekannter Herkunft** an; genau das führt dazu, dass Mixer sanktioniert werden. Cloister
lässt Mittel **ausschließlich** über einen KYC-verifizierten, auf Sanktionen geprüften On-Ramp zu, und jede Auszahlung weist die
Zugehörigkeit zu einer Compliance-Good-Set nach. Privatsphäre geht einher mit nachweisbar sauberer Herkunft und selektiver
Prüfbarkeit. Siehe [Warum Cloister](why-cloister.html) und
[Association Sets & Compliance](concept-association.html).

## Wie kann es privat sein, wenn die Blockchain öffentlich ist?

Innerhalb des Pools wird Wert als **Commitments** (Hashes) gehalten, nicht als Guthaben, und beim Ausgeben wird nur ein
unverknüpfbarer **Nullifier** offengelegt. Ein Zero-Knowledge-Beweis autorisiert jede Zahlung, ohne die
Beträge, Eigentümer oder die Information offenzulegen, welche Note welche Ausgabe finanziert hat. Ein **Relayer** reicht die Transaktion ein und zahlt
das Gas, sodass Ihre Adresse niemals der On-Chain-Absender ist. Siehe [Funktionsweise](how-it-works.html).

## Was kann ein externer Beobachter tatsächlich sehen?

Dass *eine* Shielded-Transaktion stattgefunden hat, sowie undurchsichtige Commitments und Nullifier. Bei Ein- und
Auszahlungen ist der Betrag sichtbar, der die Pool-Grenze überschreitet (Token bewegen sich). Interne Zahlungen bewegen
keine Token, daher sind ihre Beträge vollständig verborgen. Beobachter können weder den Zahler, den Empfänger, die
Verknüpfung zwischen beiden noch das Guthaben einer Partei sehen. Siehe [Privatsphäre-Modell](privacy.html).

## Kann ein Regulierer oder Auditor meine Mittel dennoch überprüfen?

Ja – das ist eine Kernfunktion. **Viewing Keys** ermöglichen eine schreibgeschützte, eng abgegrenzte Offenlegung: Sie (oder ein
autorisierter Auditor) können einen bestimmten Transaktionsverlauf offenlegen, ohne sonst etwas preiszugeben, und
ohne dabei eine Berechtigung zum Ausgeben zu erteilen. Siehe [Viewing Keys & Offenlegung](concept-viewing-keys.html).

## Wer kontrolliert mein Geld?

Sie selbst. Cloister ist **self-custodial** – Schlüssel werden aus Ihrer eigenen Seed-Phrase abgeleitet, und das Erstellen der Beweise erfolgt
**auf Ihrem Gerät**. Es gibt keinen Verwahrer und keine Hintertür. Siehe [Schlüssel & Wiederherstellung](concept-keys.html).

## Sieht der Relayer oder der ASP meine privaten Daten?

Nein. Der **Relayer** erhält stets nur den fertigen Beweis und die öffentlichen Calldata – niemals den Witness,
niemals Ihre Schlüssel. Der **ASP** kuratiert, welche geprüften Einzahlungen in der Good-Set sind; er hält niemals
Mittel und kann Sie nicht deanonymisieren. Siehe die Tabelle der Vertrauensgrenzen in [Privatsphäre-Modell](privacy.html).

## Kann der Relayer meine Zahlung stehlen oder umleiten?

Nein. Empfänger, Gebühr und Beträge sind über `ExtDataHash` in den Beweis eingebunden; eine Änderung an einem von ihnen
macht den Beweis ungültig. Der Relayer kann nur senden oder ablehnen. Falls Relayer zensieren, existiert ein optionaler
direkter RPC-Fallback (standardmäßig deaktiviert; er gibt zugunsten der Verfügbarkeit die Absender-Privatsphäre auf). Siehe
[Fallbacks & Resilienz](fallbacks.html).

## Welche Chains und Assets werden unterstützt?

Jede EVM-Chain – dieselben Verträge und der einmal kompilierte Circuit lassen sich auf jeder EVM-L2 deployen. Die Referenz-
Deployments zielen auf **Base, Polygon und Arbitrum** mit USDC. Eine `PoolRegistry` löst den
kanonischen Pool pro `chainId + asset` auf. Siehe [Deployment](deployment.html).

## Wie viel kostet eine Zahlung?

Etwa **350k Gas** pro Shielded-Zahlung, gegenüber ≈1,74M für eine naive On-Chain-Merkle-Einfügung –
rund **5× günstiger**. Die Ersparnis ergibt sich daraus, dass das Merkle-Update innerhalb des Circuits bewiesen wird, sodass der
Vertrag kein Hashing durchführt. Siehe [Der Shielded Pool](concept-pool.html#off-chain-merkle-insertion).

## Wie schnell ist das Beweisen, und funktioniert es offline?

Der native On-Device-Prover erzeugt einen Beweis in **unter einer Sekunde**. Da das Beweisen lokal erfolgt,
funktioniert es **offline** – Sie benötigen lediglich eine Verbindung, um den fertigen Beweis einzureichen. Siehe
[Architektur](architecture.html).

## Welche Technologie steckt unter der Haube?

Eine selbst entwickelte Zero-Knowledge-Schicht auf **gnark / gnark-crypto** (Groth16 über BN254), **Poseidon2**-
Hashing, ein Merkle-Baum mit fester Tiefe (2²⁰) und **kurvenfreie** Schlüssel (`pubKey = H(privKey)`). Der
Circuit umfasst 50.481 R1CS-Constraints. Siehe die [Circuit-Spezifikation](circuit.html).

## Warum gnark und nicht circom/snarkjs?

Lizenzierung und Geschwindigkeit. Die Abhängigkeiten von gnark stehen unter Apache-2 (keine GPL-Verstrickung), und der native Prover
ist rund **8× schneller** als ein WebView-snarkjs-Prover. Cloisters ZK-Schicht wurde aus genau diesem Grund GPL-frei
neu aufgebaut. Siehe [Architektur → zentrale Design-Entscheidungen](architecture.html#key-design-decisions).

## Ist es auditiert / produktionsreif?

Es handelt sich um einen **Proof of Concept**. Die Verträge und der Circuit haben einen internen adversariellen Audit bestanden, jedoch
**sind externe Audits und eine Multi-Party-Trusted-Setup-Zeremonie vor dem Mainnet erforderlich**. Verwenden Sie es
noch nicht mit echten Mitteln. Siehe den [Haftungsausschluss](disclaimer.html).

## Wie integriere ich es in mein Wallet oder meinen PSP?

Über eine additive HTTP-API + ein SDK – kein Lock-in, keine Änderung daran, wie Sie Mittel verwahren. OpenCryptoPay
ist die erste Integration. Beginnen Sie mit dem [Integrationsleitfaden](integration.html).

## Was passiert, wenn ich mein Gerät verliere?

Stellen Sie Ihre **Seed-Phrase** auf einem neuen Gerät wieder her; das Wallet leitet jeden Schlüssel neu ab, scannt die Chain erneut
und baut Ihre Notes und Ihr Guthaben wieder auf. Verlieren Sie die Seed, so gibt es – wie bei jedem self-custodial Wallet – keine
Wiederherstellung. Siehe [Schlüssel & Wiederherstellung](concept-keys.html).

## Wer steht hinter Cloister?

Cloister ist ein unabhängiges, auf Compliance ausgerichtetes Privatsphäre-Protokoll. OpenCryptoPay ist seine erste
Integration, doch das Protokoll ist unabhängig vom Zahlungsweg. Siehe das [Impressum](imprint.html).
