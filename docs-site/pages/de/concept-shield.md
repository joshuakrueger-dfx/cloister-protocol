# Mittel abschirmen

Das Abschirmen ist der Weg, auf dem Werte in den Pool **gelangen**. Es ist die wichtigste Seite zum
Verständnis von Cloisters Compliance-Haltung, denn das Abschirmen ist der **eine öffentliche
Berührungspunkt** — der einzige Ort, an dem Identität, Betrag und Screening auf die Chain treffen.

## Was beim Abschirmen geschieht

1. **Saubere Mittel beschaffen.** Sie beziehen Stablecoins über einen regulierten, KYC-geprüften
   On-Ramp — Sie durchlaufen das KYC einmal und kaufen dann USDC (Banküberweisung / Karte), die in
   Ihrer In-App-Wallet landen. (Sehen Sie den Live-Ablauf in der [Console](https://app.cloister-protocol.com).)
2. **Screening.** Sanktions-Screening und Geofencing laufen an dieser Grenze. Nur Mittel, die
   bestehen, werden in das Good-Set aufgenommen.
3. **Einzahlung.** Sie zahlen die Token in den Pool-Contract ein. On-chain ist dies ein sichtbarer
   ERC-20-Transfer von, sagen wir, 5.000 USDC in den Pool — plus die Erzeugung eines
   **verschlüsselten Commitments** für eine Note dieses Werts, die Ihrem Schlüssel gehört.
4. **Aufnahme in das Good-Set.** Die geprüfte Einzahlung wird dem Good-Set des
   Association-Set-Providers hinzugefügt, sodass sie beim Ausgeben später als „sauber" bewiesen
   werden kann — ohne zu verraten, welche Einzahlung es war.

Danach existieren Ihre 5.000 USDC nicht länger als sichtbarer Saldo auf Ihrer Adresse. Sie leben im
Pool als das Commitment `C = H(5000, pubKey, blinding)` — ein undurchsichtiger Hash.

## Warum das Abschirmen öffentlich ist (und das in Ordnung ist)

Token überqueren sichtbar die Pool-Grenze, daher ist der **Einzahlungsbetrag** konstruktionsbedingt
**sichtbar** — genau wie eine Banküberweisung auf ein Konto sichtbar ist. Privat wird alles, was
**danach** kommt: wie diese 5.000 USDC aufgeteilt, ausgegeben werden, an wen, und wie hoch Ihr Saldo
ist. Die Verbindung zwischen der öffentlichen Einzahlung und jeder späteren privaten Zahlung wird
durch die Zero-Knowledge-Schicht aufgebrochen.

Genau das macht Cloister außerdem compliant und nicht zu einem Mixer: es gibt **keinen anonymen
Zugang**. Geld unbekannter Herkunft kann nicht hinein und kann daher später nicht als sauber
bewiesen werden.

## Was öffentlich wird vs. privat

| | Öffentlich beim Abschirmen | Privat danach |
|---|---|---|
| Ihre Identität | ja (KYC am On-Ramp) | — |
| Einzahlungsbetrag | ja (Token überqueren die Grenze) | — |
| Ihr In-Pool-Saldo | — | ja — verborgen |
| Wen Sie bezahlen und wie viel | — | ja — verborgen |
| Verknüpfung Einzahlung → spätere Zahlung | — | ja — aufgebrochen |

## Ein durchgerechnetes Beispiel

Alice durchläuft das KYC und kauft **5.000 USDC**. Sie schirmt alles davon ab:

- On-chain: ein Transfer von 5.000 USDC in den Pool und ein neues Commitment.
- Die Welt sieht: *Alice hat 5.000 USDC in Cloister eingezahlt.* Mehr nicht.

Später zahlt sie über mehrere Wochen drei Lieferanten 1.000, 1.500 und 800 USDC. Die Welt sieht drei
zusammenhanglose abgeschirmte Transaktionen mit undurchsichtigen Commitments. **Niemand kann
erkennen**, dass dieselben 5.000 USDC sie finanziert haben, wer die Lieferanten sind oder dass Alice
nun 1.700 USDC Wechselgeld hält. Jede Zahlung trägt weiterhin einen Beweis, dass die Mittel auf ihre
geprüfte Einzahlung zurückgehen.

## Übergabe On-Ramp → Abschirmen

In der Referenz-Console sind der On-Ramp und der Abschirm-Schritt miteinander verdrahtet: sobald die
gekauften USDC on-chain ankommen (das SDK pollt den On-Chain-Saldo), reicht die UI den Betrag direkt
an die Abschirm-Aktion weiter — sodass „kaufen" in „abschirmen" übergeht, ohne Beträge zu kopieren.
ethers wird lazy geladen, damit dieser Pfad leichtgewichtig bleibt, bis er tatsächlich genutzt wird.

## Test- vs. echte Mittel

> Im aktuellen **Proof of Concept** **prägen** der lokale Stack und der Testnet-Relayer **Test-USDC**
> — es gibt keine echten Mittel. Die Console kennzeichnet die Finanzierungsquelle als *Devnet-Faucet
> (Test-USDC)*, gerade damit dies nie mehrdeutig ist. Im Mainnet ersetzt der geprüfte On-Ramp den
> Faucet; die Abschirm-Mechanik ist identisch.

Weiter: [Private Zahlungen](concept-pay.html) — wie sich abgeschirmte Werte bewegen.
