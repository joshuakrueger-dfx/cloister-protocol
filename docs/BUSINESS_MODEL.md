# Cloister — Geschäftsmodell

> Wie aus dem Protokoll Geld wird — hergeleitet aus der **Mechanik dieses Systems**, nicht aus
> einem SaaS-Schema. Geerdet im Code (`ShieldedPool.sol` Fee-Pfad), in den Rollen (`CONCEPT §12`),
> im Compliance-Layer (`ARCHITECTURE §5`), im Aggregat-Settlement (`ARCHITECTURE §6`), in der
> Kosten-Ökonomie (`BENCHMARK §4`) und in den Produktions-Gates (`PRODUCTION_READINESS`).
>
> Stand: 2026-06-13 · Status: Modell v0.1 · Ersetzt den Kurz-Absatz `CONCEPT §7`.

---

## 0. Die eine These (in einem Satz)

**Verschenke das Krypto-Gut, verkaufe die Regulierung und die Bilanz.**

Pool, Relayer, SDK und Prover sind in diesem Protokoll bewusst forkbar und permissionless
(`CONCEPT §12`). Was *nicht* forkbar ist, ist ein vom Regulator akzeptierter ASP-Root und eine
lizenzierte Bilanz, die Settlement und Float trägt. Cloister verdient ausschließlich dort. Alles
andere wird absichtlich gratis ausgespielt, weil es die einzige Produktqualität füttert, die
zählt: die **Größe des Anonymitäts-Sets**.

Der Rest dieses Dokuments beweist diese These aus der Systemmechanik und übersetzt sie in
konkrete Preise, Stückkosten und eine zwangsläufige Reihenfolge.

---

## 1. Wo im System physisch Wert fließt (die fünf Geld-Momente)

Bevor man über Preise redet, muss man wissen, an welchen Punkten überhaupt etwas Geldwertes durch
das Protokoll läuft. Es sind genau fünf, und jeder hat eine andere Eigentums- und Margenlogik.

| # | Moment | On-/Off-chain | Wer berührt es | Was hier monetarisierbar wäre |
|---|---|---|---|---|
| **M1** | **Shield** (Deposit Public→Pool) | on-chain, 1× pro Aufladung | Einzahler (idealerweise DFX-Onramp) | Deposit-Fee (Railgun: 0,25 %) — **wir verzichten bewusst, s. §4** |
| **M2** | **Pay** (`transact`, Proof-gebundene Fee→Relayer) | on-chain, pro Zahlung | Wallet wählt Relayer; Fee aus Shielded-Betrag | Relayer-Fee — **konvergiert gegen Gas, kein Profit-Center** |
| **M3** | **ASP-Root-Signatur** (Association-Root + Viewing-Key-Disclosure) | off-chain, periodisch | regulierter ASP (DFX) | **Compliance-as-a-Service — der eigentliche Moat** |
| **M4** | **Settlement** (DFX bucht Händler, sieht den Betrag ohnehin) | off-chain | DFX als Settlement-Broker | **bps-Clip auf den gesettelten Wert — der Volumenmotor** |
| **M5** | **Aggregat-Unshield / Float** (DFX hält kurz Pool-Guthaben, `ARCH §6`) | on-chain, gebündelt | DFX-Treasury | **Float-Yield — Bilanz-Upside, optional** |

Der Code zeigt M2 wörtlich: `if (extData.fee > 0) token.safeTransfer(extData.relayer, extData.fee)`
(`ShieldedPool.sol`). Die Fee geht an die Adresse, die das **Wallet** in den Witness schreibt
(`sdk/src/witness.js`, `relayer`-Feld). Wer das nicht kontrolliert — und in einem permissionless
Markt kontrolliert es niemand — kann hier keine Marge halten. Das ist keine Meinung, das steht im
Datenfluss.

---

## 2. Forkbarkeit entscheidet über Marge — Rolle für Rolle

Cloister definiert fünf **Rollen als Schnittstellen** (`CONCEPT §12.1`). Eine Rolle kann nur dann
dauerhaft Marge halten, wenn sie **nicht permissionless substituierbar** ist. Genau das macht das
Modell individuell: die Preisstrategie folgt nicht aus „was könnten wir verlangen", sondern aus
„wo lässt das eigene Protokoll-Design überhaupt eine Marge zu".

| Rolle | Permissionless ersetzbar? | Warum | Hält Marge? |
|---|---|---|---|
| **Pool / Verifier** | Ja — öffentlicher Contract, `§12.4` verlangt *neutrale* Governance | Eine Contract-Fee würde geforkt; neutrale Governance darf keine private Gebühr erheben | **Nein** |
| **Relayer** | Ja — `§12.1` „permissionless"; Wallet benennt den Relayer im Proof | Race-to-Gas-Floor; jeder Node kann broadcasten | **Nein** (→ Kostenniveau) |
| **Prover / SDK** | Ja — `§12.2` Open-Source-Referenz-SDK | Frei kopierbar | **Nein** |
| **Provider / PSP** | Teilweise — braucht Händler-Beziehungen + Lizenzen | Wettbewerblich, aber beziehungs-/lizenzgebunden | Dünn, beziehungs-verteidigt |
| **ASP (Compliance)** | **Nein** — ein Root, signiert von einer *unlizenzierten* Entität, hat für regulierte Gegenparteien **keinen Wert** | **Vertrauen ist nicht forkbar** | **Ja** |

Zusätzlich kaptiert die **Settlement-Rolle** (M4/M5) eine zweite nicht-substituierbare Größe: den
**Float** und den **Zugang zu Fiat-Rails**, beides an Custody-/Geldtransmitter-Lizenz und
Working Capital gebunden (`PRODUCTION_READINESS §1, §5`).

**Schlussfolgerung:** Es gibt in diesem Protokoll genau zwei dauerhaft verteidigbare Margen — die
**Compliance-Schicht (ASP)** und die **Settlement-Schicht (bps + Float)**. Beide entspringen
demselben Fakt: DFX ist eine *regulierte Bilanz-Entität*. Keine entspringt der Software. Deshalb
wird die Software korrekt verschenkt.

---

## 3. Warum das Anonymitäts-Set die Preislogik diktiert (öffentliches Gut + Free-Rider)

Das Set hat die Ökonomie eines **öffentlichen Guts**:

- **nicht-rival:** ein zusätzlicher Nutzer schmälert die Privacy anderer nicht — er *vergrößert*
  sie (das Set wächst). Positiver Externaleffekt.
- **nicht-exklusiv:** jeder PSP/jedes Wallet am kanonischen Pool profitiert vom Set, das DFX mit
  seinem Onramp-Volumen seedet (`ARCH §5/§11`: Deposits kommen idealerweise KYC'd aus dem Onramp).

DFX bezahlt also privat (Onramp-Deposit-Flow + Relayer-Gas + ASP-Betrieb) für ein Gut, von dem
Wettbewerber gratis mitprofitieren. Die naive Reaktion wäre, das Set einzuzäunen (eigener Pool pro
PSP). Das ist in `§12.4` explizit als **Fehler** markiert: getrennte Pools fragmentieren die Sets
→ schwächere Privacy für alle → das Produkt wird schlechter.

Daraus folgt die zentrale, **gegen-intuitive Preisregel dieses Modells**:

> **Besteuere niemals die Handlung, die das Set vergrößert. Monetarisiere die Komplemente zum Set,
> die nur DFX liefern kann.**

Das Set bleibt gratis und offen — *gerade weil* das es groß macht. Und ein großes Set ist der
Grund, warum DFXs compliant Settlement-Rail der offensichtlich beste Ort ist, um aus diesem Set
*tatsächlich auszugeben*. Offenes Allgemeingut (Set) + privat besessene, regulierungs-gegatete
Komplemente (ASP + Settlement). Man verschenkt die Commodity-Schicht und verkauft die regulierte.

---

## 4. Die Preis-Architektur (was daraus zwangsläufig folgt)

Jede Zeile hier ist eine Konsequenz aus §2–§3, kein frei gewähltes Tier.

### 4.1 Shield — **€0** (bewusst, gegen die Referenz)
Railgun nimmt 0,25 % pro Shield/Unshield (`BENCHMARK §4`). Für Cloister wäre das ein Fehler:

- Eine Deposit-Fee besteuert genau die Handlung aus §3, die das Set füttert.
- Cloister ist ein **Retail-Payments**-Produkt, kein DeFi-Whale-Tool. Deposits sind klein und
  häufig; 0,25 % auf die Aufladung *fühlt* der Gelegenheitsnutzer — und der Gelegenheitsnutzer ist
  der ganze Zweck des Set-Wachstums.
- Das Deposit ist die **Kundenakquise fürs Set**. Man bezahlt, um Set-Mitglieder zu gewinnen, man
  besteuert sie nicht. DFX trägt das Shield-Gas via Paymaster/Onramp-Integration.

CAC-Framing: Shield-Gas (L2: einige Cent, `BENCHMARK §3`) ist der günstigste denkbare
Customer-Acquisition-Cost für ein Privacy-Set. Diese Cents sind Marketing, keine Kosten.

### 4.2 Relayer — **Gas + ~10 % Spread (Kostendeckung, kein Profit)**
Aus §1/§2 zwingend: das Wallet wählt den Relayer, der Markt ist permissionless. Jeder Versuch,
hier Marge zu nehmen, wird unterboten oder per Self-Broadcast-Fallback (`ARCH §7`) umgangen.
Also: DFX-Relayer läuft als Default-Set, abgerechnet zu **Gas × ~1,1** (Railgun-Referenz), rein
zur Infra-Deckung. Auf L2 ist das sub-Cent und für den Nutzer praktisch unsichtbar. Strategischer
Sinn des DFX-Relayers ist nicht die Fee, sondern **Verfügbarkeit/SLA** (kein Zensur-/Ausfall-Loch
im Flow) — und die ist Teil der Subscription (§4.4), nicht der per-Tx-Fee.

### 4.3 Settlement-Clip — **0,15–0,30 % des gesettelten Werts** (der Volumenmotor)
Hier sitzt die skalierende Einnahme, und sie ist **privacy-neutral**: DFX kennt den Betrag im
Settlement ohnehin (`CONCEPT §51`: „DFX muss ihn fürs Händler-Settlement kennen"). Der Clip
liegt auf M4, nicht auf der Privacy-Handlung — er verrät nichts und schrumpft kein Set.

Wettbewerbs-Anker:

| Rail | typische Gebühr |
|---|---|
| Karten-Interchange (EU/Debit … Kredit) | ~0,2 % … 1,5–3,5 % |
| etablierte Krypto-PSPs | ~0,5–1,0 % |
| **Cloister-Settlement-Clip** | **0,15–0,30 %** |

Bei diesem Niveau ist die *Privacy-Variante ein Rabatt gegenüber Fiat-Rails* und liegt unter den
Krypto-PSP-Sätzen — und ist für DFX nahezu reine Marge, weil der marginale Tx-Kostenanteil (Gas)
vom Relayer-Pfad (§4.2) gedeckt ist. Wichtig: der Clip betrifft **nur den shielded Pfad**; der
klassische OCP-Flow (Level 0) bleibt unverändert bepreist.

### 4.4 ASP-as-a-Service — **Subscription pro reguliertem Integrator** (die Fixkosten-Deckung)
Das ist die einzige Rolle mit echtem Lock-in-Wert (§2), aber der Wert ist **regulatorisch, nicht
technisch**. Verkauft wird:

- der periodisch signierte `associationRoot`-Feed (Inclusion-/Exclusion-Basis, `ARCH §5`),
- das Viewing-Key-Disclosure-Dashboard (selektive Offenlegung für Audit/Steuer/Regulator),
- PPOI-Default-Nachweise gegen Pool-Vergiftung,
- Relayer-/Indexer-SLA + Konformitäts-Zertifizierung,
- und — der eigentliche Kaufgrund — ein **Name, den ein regulierter Integrator in seine eigene
  Aufsichts-/Compliance-Akte schreiben kann.**

Gestaffelt nach gesetteltem Monatsvolumen + SLA-Stufe (Richtwerte, vor Vertrieb zu kalibrieren):

| Band (gesetteltes Shielded-Volumen/Monat) | Subscription (Richtwert) | enthält |
|---|---|---|
| < €1 Mio | €2–5k/Mo | Root-Feed, Standard-Disclosure, Best-Effort-Relayer |
| €1–10 Mio | €8–15k/Mo | + SLA-Relayer-Set, dediziertes Disclosure-Dashboard, Travel-Rule-Hooks |
| > €10 Mio | €20k+/Mo, individuell | + neutrale-Governance-Sitz, Custom-ASP-Policy, Priorisierter Support |

Die Subscription ist der **Überlebens-Motor der frühen Jahre** (deckt die Fixkosten, bevor das
Settlement-Volumen trägt — s. §6). Der bps-Clip ist der **Skalierungs-Motor der späten Jahre**.

### 4.5 White-Label-Lizenz — **Setup + Jahreslizenz** (für eigene Deployments)
Für Entitäten, die einen eigenen Stack fahren wollen (eigener Provider/ASP, eigene Chain-Auswahl).
Verkauft wird **nicht der Code** (der ist Open Source, `§12.2`), sondern: auditierte Circuits +
verifizierter Trusted-Setup, das ASP-Framework, Konformitäts-Zertifizierung, **Indemnity/SLA** und
der Marken-/Audit-Anker für die regulatorische Einreichung. Richtwert: **Setup ab €100k** (deckt
Integration + Audit-Weitergabe) + **Jahreslizenz** nach Volumen. Man verkauft Assurance und einen
Namen, keine Bytes.

### 4.6 Float-Yield — **Treasury-Ertrag auf Settlement-Working-Capital** (optional, Bilanz)
Im Aggregat-Settlement-Modus (`ARCH §6`) hält DFX zwischen Zahlung und gebündeltem Unshield kurz
Pool-internes Guthaben. Auf Volumen ist das ein **Float** — Treasury-Yield auf Stablecoin-Balance
plus der Zeit-Spread zwischen Händler-Gutschrift und Unshield. Das ist eine **Bilanz-Zeile, kein
Preis**, und bewusst *optional*: Händler, die keine Timing-Privacy brauchen, bekommen
Instant-Unshield (1:1) — dann hält DFX nie Guthaben, es gibt keinen Float, aber auch **kein
Honeypot-Risiko** (`PRODUCTION_READINESS §5`). Float ist Upside, nie tragend.

---

## 5. Was wir bewusst NICHT bepreisen — und warum (die Signatur des Modells)

Diese Liste ist das Gegenteil des Reflexes, „überall ein bisschen mitzunehmen". Jeder Verzicht ist
eine aktive Entscheidung mit kausalem Grund:

- **Kein Shield-Fee** → würde das Set-Wachstum besteuern (§3/§4.1). Das Set ist das Produkt.
- **Kein Relayer-Profit** → permissionless, würde unterboten/umgangen (§2). Würde nur die UX
  verteuern und den Self-Broadcast-Anteil erhöhen (= mehr Deanonymisierung).
- **Keine Contract-/Pool-Fee** → würde geforkt und widerspricht der neutralen Governance, die Dritte
  überhaupt erst zum *gemeinsamen* Pool bewegt (`§12.4`). Eine Pool-Fee zerstört den geteilten Set.
- **Keine Konsumenten-Privacy-Gebühr** → der Zahler darf Privacy als *Gratis-Feature* erleben;
  jede Friktion am Zahler schrumpft das Set und damit die Privacy aller.
- **Keine Gebühr auf den klassischen Level-0-Flow** → Rückwärtskompatibilität ist das
  Adoptions-Versprechen; sie zu besteuern, würde Wallets vom Andocken abhalten.

Merksatz: **Alles, was das Set vergrößert oder die Adoption senkt, bleibt gratis. Bepreist wird nur,
was DFX qua Regulierung und Bilanz exklusiv liefert.**

---

## 6. Stückkosten & Break-even (Fixkosten-Deckungs-Spiel)

Cloister ist kein per-Feature-, sondern ein **Fixkosten-Deckungs-Geschäft**: die Gates sind teuer
und einmalig, die marginale Zahlung kostet Cent-Gas (das der Relayer-Pfad deckt). Die ganze
Strategie ist, die versenkten Regulierungs-/Audit-Kosten über möglichst viel **Volumen durch die
compliant Rail** zu verteilen.

**Einmalige Gates** (aus `PRODUCTION_READINESS §1/§2`):

| Posten | Größenordnung |
|---|---|
| 2× unabhängige ZK-Audits (Circuits + Contracts) | $100–500k je → **$0,4–1,0 Mio** |
| Multi-Party Trusted-Setup-Ceremony | ~$50–150k |
| Legal-Memos CH/EU/US (Tornado-/OFAC-Präzedenz, MiCA/PSD2) | ~$100–300k |
| Money-Transmission / Custody-Lizenzierung | $100k–$1 Mio+ (jurisdiktionsabhängig) |
| **Summe Gate** | **~$1–3 Mio** |

**Laufende Kosten:** ASP-Betrieb + Relayer-/Indexer-Infra + Treasury-/Custody-Ops + wenige FTE →
Richtwert **~$1–2 Mio/Jahr**.

**Break-even auf den Settlement-Clip allein** (bei 0,25 %):

| gesetteltes Shielded-Volumen/Jahr | Clip-Ertrag @0,25 % | deckt laufende Kosten? |
|---|---|---|
| €50 Mio | €125k | nein → Subscription trägt |
| €200 Mio | €500k | teilweise |
| €800 Mio | €2,0 Mio | ja (laufend) |

**Lesart:** Der bps-Clip allein trägt erst im hohen dreistelligen Millionen-Volumen. **Bis dahin
müssen Subscriptions (§4.4) + White-Label (§4.5) die laufenden Kosten decken.** Das ist keine
Schwäche, sondern die natürliche Sequenz: erst ein paar zahlende regulierte Integratoren (hohe
ACV, wenige Logos), die die Fixkosten tragen, während das Set und damit das Settlement-Volumen
wächst, das dann den skalierenden Clip-Ertrag liefert.

---

## 7. Zwangs-Reihenfolge (an die Readiness-Gates gekoppelt)

Man kann die Compliance-Subscription nicht verkaufen, bevor ASP + Viewing-Key **im Circuit** leben
(`PRODUCTION_READINESS §1` P0). Die Einnahmequellen schalten sich daher in erzwungener Reihenfolge
frei — jede an einen konkreten Blocker gekoppelt:

| Phase | Voraussetzung (Gate) | Was monetarisiert |
|---|---|---|
| **P0 — heute (PoC)** | — | **Kein Umsatz.** Ziel: Design-Partner-LOI mit 1 PSP (nicht-bindend, validiert Zahlungsbereitschaft). |
| **P1 — erste Rail** | ASP in-circuit + 1 Audit + 1 L2-Mainnet, kleines Set | **Relayer-at-cost** live; erster **Settlement-Clip auf DFX-eigenes Wallet-Volumen** (intern, kein Dritter nötig). Float beginnt optional. |
| **P2 — externer Integrator** | 2. Audit + MPC-Ceremony + Custody/MSB-Struktur | **ASP-as-a-Service-Subscription** an den ersten externen PSP. White-Label-Gespräche. |
| **P3 — kanonischer Pool** | geteilter Pool + neutrale Governance + Multi-L2 | **Set ist das Asset.** Clip skaliert über alle PSPs; DFX ist Anker-ASP/Settlement-Underwriter des Standards. |

Bemerkenswert: In **P1 braucht DFX keinen externen Kunden** — der Settlement-Clip läuft auf dem
eigenen dfx-wallet-Volumen (`INTEGRATION_DFX_WALLET.md`). Das Modell erzeugt also Umsatz, bevor der
erste Dritte unterschreibt. Der externe Verkauf (P2) ist Expansion, nicht Überlebensbedingung.

---

## 8. Adversariell — was jede Einnahmequelle killt

| Einnahmequelle | Was sie killt | Verteidigung / Konsequenz |
|---|---|---|
| **Settlement-Clip (§4.3)** | ein anderer regulierter PSP bietet dieselbe compliant Rail billiger | Anker-Effekt: Integratoren routen über das tiefste Set + die beste Compliance-Reputation. DFX besitzt in OCP bereits die Händler-/Settlement-Beziehung → Wechselkosten = Händler-Integration, nicht der Pool. |
| **ASP-Subscription (§4.4)** | **Regulator verwirft das compliant-Privacy-Narrativ ganz** (Tornado/OFAC, `PR §1` P0) | **Existenziell, kein Preisproblem.** Das gesamte Umsatz-Modell ist *downstream* des Legal-Memos. Keine Preis-Cleverness ersetzt es — das Memo ist Bedingung, nicht Beiwerk. |
| **Float-Yield (§4.6)** | Custody-/Honeypot-Vorfall oder regulatorisches Float-Verbot | Trust-Fenster minimieren (`ARCH §6`), versicherte Custody, Instant-Unshield-Modus (DFX hält nie) → Float ist *optionales* Upside, nie tragend. |
| **Relayer (§4.2)** | — war nie eine Einnahmequelle | korrekt zu Kosten bepreist; nichts zu killen. |
| **White-Label (§4.5)** | Wettbewerber paketiert das Open-Source-SDK gratis | Lizenz = auditierte Circuits + ASP-Framework + Indemnity/Konformitäts-Zertifikat + Name fürs Filing, nicht der Code. |

Die wichtigste Zeile ist die zweite: **die ganze These hängt an einer einzigen regulatorischen
Frage.** Deshalb ist das `[P0]`-Legal-Memo in `PRODUCTION_READINESS` nicht nur ein technisches
To-do — es ist die **Investitionsentscheidung** für dieses Geschäftsmodell. Fällt es negativ aus,
ist nicht der Preis falsch, sondern das Produkt nicht verkäuflich. Es zuerst zu klären ist
ökonomisch das Billigste, was man tun kann.

---

## 9. Empfehlung (das eine Modell, auf das man sich festlegt)

> **Verschenke Pool, Relayer, SDK und Prover ohne Reue — sie sind Marketing fürs Anonymitäts-Set.
> Halte Shield gratis, weil jede Einzahlung ein Set-Mitglied kauft. Verdiene ausschließlich dort,
> wo Regulierung und Bilanz nicht forkbar sind: ein bps-Clip auf den DFX-ohnehin-sichtbaren
> Settlement-Betrag als Volumenmotor, eine ASP-/Compliance-Subscription pro reguliertem Integrator
> als Fixkosten-Deckung, und optionaler Float-Yield als Bilanz-Upside.**

**Preis-Karte (Richtwerte, vor Vertrieb zu kalibrieren):**

| Hebel | Preis | Rolle im Modell |
|---|---|---|
| Shield | **€0** (DFX-Paymaster) | CAC fürs Set |
| Relayer | **Gas × ~1,1** | Kostendeckung, sub-Cent |
| Settlement-Clip | **0,15–0,30 %** des gesettelten Werts (nur shielded) | Volumenmotor, privacy-neutral |
| ASP-as-a-Service | **€2–20k+/Mo**, volumen-/SLA-gestaffelt | Fixkosten-Deckung, der Moat |
| White-Label | **Setup ab €100k + Jahreslizenz** | hohe ACV, wenige Logos |
| Float | Treasury-Yield, nur im Aggregat-Modus, versichert | optionales Bilanz-Upside |

**Reihenfolge:** zuerst das `[P0]`-Legal-Memo (die Investitionsentscheidung), dann Settlement-Clip
auf eigenem Wallet-Volumen (P1), dann ASP-Subscription an den ersten externen PSP (P2), dann den
kanonischen Pool als geteiltes Asset (P3).

**Der eine Satz fürs Steuern:** *Cloister verschenkt die Infrastruktur und verkauft die Regulatorik
— weil das Design alles andere wegkonkurriert und nur die regulierte Bilanz übrig lässt.*
