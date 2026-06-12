# Cloister — Privacy Layer für OpenCryptoPay

> Arbeitstitel. Eigenständiges Produkt, das den OpenCryptoPay-Standard um vertrauliche
> Zahlungen erweitert. Chain-agnostisch (jede EVM-Chain), als Managed Service / Lizenz
> durch DFX verkauf-/vermietbar.

Stand: 2026-06-12 · Status: Konzept v0.1

---

## 1. Problem

Im heutigen OpenCryptoPay-Flow läuft eine EVM-Zahlung so:

1. POS erzeugt QR → Wallet holt Quote (`recipient`, `quote`, `transferAmounts`, `callback`).
2. Wallet holt Tx-Details: bekommt eine **EIP-681-URI**, z. B.
   `ethereum:0x9C22…10FC@1?value=660720000000000` — die Empfängeradresse ist eine
   **DFX-Intermediär-Adresse**, kein Händler.
3. Wallet signiert einen **plain EOA-Transfer von der eigenen Adresse**, broadcastet
   aber nicht, sondern schickt das **rohe Signed-Tx-Hex** an die DFX-API.
4. DFX validiert, broadcastet, empfängt die Coins und settled den Händler off-chain
   (Fiat / Stablecoin / Krypto).

### Das Leck
- **On-chain:** Die Zahler-Adresse erscheint als `from` des Transfers an die (öffentlich
  bekannte) DFX-Adresse. Jeder Beobachter sieht: *„Wallet 0xABC hat X gezahlt"* — und kann
  von dort Guthaben, Token-Holdings, NFTs und per Heuristik **weitere Wallets desselben
  Eigentümers** und damit das **Gesamtvermögen** ableiten.
- **Gegenüber DFX:** Schon das eingereichte Tx-Hex enthält die Zahler-Adresse; die
  API-Calls tragen zusätzlich die IP. DFX hat also den vollständigen Payment-Graph.

Der **Betrag** ist kein Geheimnis (der Händler kennt den Kassenpreis). Schützenswert ist
die **Verknüpfung Wallet ↔ Zahlung** und damit die Ableitbarkeit des Vermögens.

---

## 2. Ziel & Schutzversprechen

Nach einer Zahlung an der Kasse soll gelten:

- **P1 — Unlinkability:** Niemand (Händler, Umstehende, Chain-Analyst) kann die Zahlung
  einer konkreten Zahler-Adresse zuordnen.
- **P2 — Kein Vermögens-Leak:** Aus der Zahlung lässt sich weder Guthaben noch das
  Bestehen weiterer Wallets des Zahlers ableiten.
- **P3 — Optionale Betrags-/Timing-Verschleierung** gegenüber on-chain-Beobachtern
  (Stufe 2, siehe Roadmap).
- **P4 — Compliance-fähig:** kein anonymer „Mixer", sondern KYC-gated Pool mit
  Association-Sets + Viewing-Keys, damit DFX als regulierte Entität es betreiben und
  weiterverkaufen kann.

**Bewusst NICHT im Scope:** Den Betrag gegenüber DFX zu verbergen — DFX muss ihn für das
Händler-Settlement kennen. Privacy zielt auf alle *außer* dem Settlement-Broker; gegenüber
DFX wird die Zahler-*Identität* trotzdem entkoppelt (s. u.).

---

## 3. Lösungsidee — Shielded Payment Pool

Zwischen Wallet und dem OpenCryptoPay-Tx-Submit-Schritt schiebt sich ein **abgeschirmter
Pool** (Commitment-/UTXO-Modell mit zk-SNARKs, Bauart wie Privacy Pools / Railgun):

```
        Shield (1×, öffentlich)            Pay (privat, via Relayer)
 Haupt-Wallet ───────────────▶  [ Shielded Pool ]  ──────────────▶  DFX-Intermediär-Adresse
   (oder DFX-Onramp direkt)        Merkle-Tree           zk-Proof          (Betrag sichtbar,
                                  von Commitments      statt EOA-Tx         Zahler unsichtbar)
```

### Bausteine

**a) Pool-Contract (pro Chain, multi-Asset)**
- `commitment = Poseidon(amount, asset, ownerPubkey, blinding)`, eingehängt in einen
  inkrementellen Merkle-Tree (Tiefe ~32).
- `nullifier = Poseidon(commitment, leafIndex, ownerPrivkey)` verhindert Double-Spend,
  ohne zu verraten *welches* Commitment ausgegeben wurde.
- Verschlüsselter Memo (ECDH auf Viewing-Key) trägt `amount/asset` an den Empfänger.

**b) Operationen**
- **Shield (Deposit):** Public-Token in den Contract → Commitment. Der einzige öffentliche
  Berührungspunkt des Haupt-Wallets. Entschärfung: Deposit **direkt aus dem DFX-Onramp** in
  den Pool (der „Einzahler" ist dann DFX, nie ein doxbares Wallet) und/oder feste
  Denominationen.
- **Pay (Private Transfer):** zk-Proof beweist *„ich besitze Notes ≥ Betrag, ich autorisiere
  `amount` an `recipient` (DFX) + `change` zurück als neue Note"*. Öffentlich werden nur
  `(recipient, amount, nullifiers, neue commitments)` — **keine Verbindung zum Einzahler**.
- **Unshield (Withdraw):** optionaler Exit auf eine Public-Adresse.

**c) Relayer-Netz**
- Reicht die Proof-Tx ein und **zahlt das Gas**, damit der Zahler kein gas-finanziertes
  (= deanonymisierendes) Konto braucht. Gebühr wird aus dem Shielded-Betrag abgezogen.
- Relayer kann nicht stehlen: Empfänger & Betrag sind im Proof gebunden.
- DFX betreibt Relayer als Teil des Managed Service; Lizenznehmer können eigene fahren.

**d) Compliance-Layer (verkaufsentscheidend)**
- **Association-Set-Provider (ASP):** Proof, dass das eigene Deposit zu einem freigegebenen
  Set gehört (Privacy-Pools-Ansatz). DFX als ASP über seine KYC → sauber von illegalen
  Geldern trennbar.
- **Viewing-Keys:** Nutzer/Auditor/Steuer können die *eigene* Historie entschlüsseln —
  selektive Offenlegung statt Totalanonymität.
- Das ist der Unterschied „compliant Privacy" vs. „Tornado": betreibbar durch eine
  regulierte Entität.

### Erreichte Eigenschaften
- **P1/P2 ✓** — die Pay-Tx kommt vom Pool/Relayer, nie von der Zahler-Adresse;
  Anonymitäts-Set = alle Pool-Nutzer. Kein Vermögens-/Wallet-Clustering möglich.
- **Auch gegenüber DFX:** das eingereichte Artefakt ist der Proof (ohne Zahler-Adresse);
  via Relayer/Tor auch ohne IP-Leak. DFX kennt Quote/Händler/Betrag, aber nicht *wer* zahlt.
- **P3** kommt in Stufe 2 (Aggregat-Settlement / Pedersen-Beträge).

---

## 4. Integration in OpenCryptoPay (minimal-invasiv)

Quote- und Recipient-Mechanik (Schritte 1–2) bleiben **unverändert**. Erweiterung nur an
Schritt 3–5:

- Neue Einträge in `transferAmounts` als **shielded Varianten**, z. B. Method
  `"Polygon-Shielded"` / Asset-Flag `shielded:true`. So handelt das bestehende Protokoll
  die Vertraulichkeit ganz normal aus — Wallets ohne Support ignorieren sie.
- Der `callback`/`uri` liefert dann **Pool-Contract-Adresse + Calldata-Template** statt der
  EIP-681-EOA-URI.
- Das Wallet baut den zk-Proof und reicht ihn (statt rohem Tx-Hex) über den Relayer an die
  DFX-Submit-API ein. Aus DFX-Sicht ist es weiterhin „eine Tx, die den Quote erfüllt".

→ **Rückwärtskompatibel und additiv.** Ein Vorschlag dafür kann als Erweiterung in den
offenen OpenCryptoPay-Standard eingebracht werden (eigener Abschnitt „Shielded Methods").

---

## 5. Chain-Fokus (L2-only)

- **Zielketten: Polygon, Base, Arbitrum** — die großen, günstigen L2, auf denen Retail-
  Zahlungen real stattfinden. **Ethereum L1 ist bewusst kein Ziel** (Gas im Dollar-Bereich
  pro Shielded-Tx macht Kassenzahlungen unwirtschaftlich, s. `BENCHMARK.md`).
- Identische Contracts + einmal kompilierte Circuits, deploybar auf jede dieser EVM-L2 —
  deckt sich mit den heute in `transferAmounts` gelisteten L2-Methods. Weitere L2 (z. B.
  Optimism) später additiv ohne Neudesign.
- Eine **Registry** mappt `chainId → poolAddress / verifier / asset-liste`.
- Pro Chain ein eigenes Anonymitäts-Set; Cross-Chain-Korrelation wird vermieden, indem
  Quotes pro Chain unabhängig sind.

---

## 6. Build vs. Integrate

| Option | Inhalt | Pro | Contra |
|---|---|---|---|
| **A: Railgun integrieren** | Produktionsreife EVM-Shielded-Pools, Relayer-Netz, Viewing-Keys, „Proof of Innocence" | Schnellster Time-to-Market, auditierte Circuits | Abhängigkeit, weniger Kontrolle über Compliance-Policy & Roadmap |
| **B: Privacy-Pools-Fork (0xbow)** | Compliant-Pool-Design (Buterin/Soleimani), ASP-nativ | Compliance „by design", gutes regulatorisches Narrativ | Asset-/Feature-Umfang heute schmaler, mehr Eigenbau |
| **C: From scratch** | Eigene Circuits + Contracts + Relayer | Volle Kontrolle, sauberes Eigentum zum Weiterverkauf | Teuer, Audit-Last, langsamer |

**Empfehlung:** Start als **B mit Anleihen aus A** — Compliance-first-Pool, aber Relayer-
und Wallet-SDK-Patterns von Railgun adaptieren. Eigentum/Lizenzierbarkeit bleibt bei DFX.

---

## 7. Geschäftsmodell (verkauf-/vermietbar)

- **Managed Service:** DFX betreibt Relayer-Infra + ASP + Compliance-/Viewing-Key-Dashboard.
  Abrechnung: per-Tx-Relayer-Fee + SaaS-Abo pro Händler/PSP.
- **Lizenz/SDK:** PSPs/Händler lizenzieren Wallet-SDK + Pool-Deployment, fahren optional
  eigene Relayer (White-Label).
- **Add-on-Verkauf:** als optionales Privacy-Modul oben auf jedes OpenCryptoPay-Deployment.

---

## 8. Roadmap

- **Stufe 0 — PoC (1 Chain, 1 Stablecoin):** Pool-Contract + Pay-Circuit + ein Relayer +
  Wallet-Demo, integriert in den OCP-Flow auf z. B. Base. Ziel: P1/P2 nachweisbar.
- **Stufe 1 — Compliance & Multi-Asset:** ASP, Viewing-Keys, mehrere Stablecoins, Shield via
  DFX-Onramp.
- **Stufe 2 — Betrags-/Timing-Privacy (P3):** Aggregat-Settlement an DFX (gebündelte
  On-chain-Beträge, Einzelzuordnung off-chain via Memo) oder Pedersen-verborgene Beträge.
- **Stufe 3 — Multi-Chain-Rollout + SDK-Hardening + externes Audit.**
- **Stufe 4 — Standardisierung:** „Shielded Methods" als Erweiterung in den offenen
  OpenCryptoPay-Standard einbringen.

---

## 9. Offene Entscheidungen / Risiken

- **Regulatorik:** Auch ein compliant Pool ist erklärungsbedürftig (Geldwäsche-Narrativ).
  ASP + Viewing-Keys + KYC-gated Deposits sind die Antwort — muss früh mit Legal abgestimmt
  werden.
- **Liquiditäts-/Anonymitäts-Set:** Privacy steigt mit Nutzerzahl. Kleiner Pool = schwache
  Anonymität. Anreiz, dass Onramp-Käufe default in den Pool gehen.
- **UX:** Proof-Generierung im Wallet (Zeit/Akku auf Mobil), Relayer-Verfügbarkeit, Recovery
  der Notes (Viewing-Key-Backup).
- **Trust in DFX bleibt** beim Settlement bestehen — Privacy entkoppelt die Identität, hebt
  aber die Intermediär-Rolle nicht auf. Für „auch DFX-trustless" wäre ein zusätzlicher
  Schritt nötig (out of scope v0.1).

---

## 10. Spending-Guthaben & Spending-Session (Performance-Modell)

**Kernkorrektur:** Der zk-Proof entsteht **beim Ausgeben**, nicht beim Shielden. Er bindet
`Empfänger` + `Betrag`, die erst aus der Quote feststehen → **nicht vorab berechenbar**.
Vor-Shielden spart also den Einzahl-Schritt an der Kasse, nicht die Proof-Zeit. Die
Proof-Sekunden werden stattdessen **klein gemacht und versteckt**:

**a) Vorgeladenes Shielded-Spending-Guthaben**
- Nutzer lädt einmalig ein Budget in den Pool (idealerweise direkt aus dem DFX-Onramp).
- An der Kasse kein Deposit/Onramp-Roundtrip mehr — nur noch der Pay-Proof.

**b) Feste Stückelungen (Denominations)**
- Guthaben liegt als kleine Notes vor (z. B. 1/5/10/50-Einheiten). Eine Zahlung braucht dann
  einen **kleinen Circuit (1×2)** statt eines großen → Proof-Zeit ans untere Ende (**~1–2 s**
  statt bis 10 s). Nebeneffekt: einheitliche Beträge stützen die Stufe-2-Privacy.

**c) Hintergrund-/Optimistic-Proving**
- Proof-Generierung startet, sobald der Betrag aus Schritt 3 vorliegt — **parallel** dazu
  liest der Nutzer „12,50 € — bezahlen?" und tippt. Die 1–2 s überlappen mit einer Aktion,
  die ohnehin passiert → **gefühlte Latenz ≈ 0**.

**d) Spending-Session (Ausbaustufe)**
- Einmalige Vorab-Autorisierung eines Budgets („bis 200 € freigegeben"), danach laufen
  Einzelzahlungen mit minimalem/relayer-unterstütztem Proof nahezu instant (Tap-to-pay-
  Gefühl). Designfrage: wie weit die Autorisierung vorab gebunden wird, ohne Sicherheit/
  Privacy zu schwächen (Session-Key mit Limit + Ablauf, im Circuit gebunden).

---

## 11. Optimierungs-Hebel (Latenz · Gas · Tx-Anzahl · Durchsatz)

Priorisiert: **[Quick Win]** = früh, geringer Aufwand · **[Struktur]** = größerer Umbau,
größter Hebel.

### Latenz (gefühlt & real)
- **[Quick Win]** Hintergrund-Proving ab Schritt 3 + vorgewärmter Prover (Proving-Keys
  vorgeladen, Notes lokal indexiert) → kein Kaltstart an der Kasse.
- **[Quick Win]** Kleine Circuits via feste Stückelungen (§10b).
- **[Quick Win]** **Groth16** als Proof-System: kleinste Proofs + günstigste On-chain-
  Verifikation; ideal für Mobil-Prove-Speed (Tradeoff: per-Circuit Trusted Setup — via
  MPC-Ceremony lösbar).
- **[Struktur]** Native/GPU-Prover statt reinem WASM auf fähigen Geräten; Witness-
  Berechnung inkrementell.
- **[Struktur, Privacy-Tradeoff]** Delegiertes Proving (Server) mit **MPC-Key-Split**, damit
  der Spending-Key den Server nie im Klartext erreicht — nur für schwache Geräte, klar
  dokumentiert.

### Gas / Kosten pro Zahlung
- **[Gesetzt]** **L2-only** (Polygon/Base/Arbitrum): selbst der ~5–10× höhere Gas-Verbrauch
  eines `transact` bleibt absolut im Cent-Bereich. Ethereum L1 ist kein Ziel.
- **[Quick Win]** BN254-Pairing-Precompile (0x08) für günstige Groth16-Verifikation nutzen.
- **[Quick Win]** Commitments/Nullifier als **Events** statt teurem Storage emittieren, wo
  möglich (Light-Client rekonstruiert den Baum).
- **[Struktur]** Calldata komprimieren / **Blobs (EIP-4844)** auf L2 — Datenkosten dominieren
  dort.
- **[Struktur, größter Hebel]** **Rekursive Proof-Aggregation**: viele Zahlungen werden in
  *einen* On-chain-Verify gebündelt → Verifikationskosten pro Zahlung sinken drastisch.
- **[Struktur]** Account-Abstraction-Paymaster für Gas-Sponsoring / Abrechnung in Stablecoin
  statt Native-Token.

### Transaktions-Anzahl
- **[Quick Win]** Pro Zahlung bleibt es **eine** On-chain-Tx; Change bleibt als Note im Pool
  (kein Extra-Transfer).
- **[Quick Win]** **Aggregat-Settlement** auf DFX-Seite (Stufe 2): viele Zahlungen → eine
  Unshield-Tx → on-chain **weniger** Txs als beim heutigen 1:1-Modell.
- **[Struktur]** **Note-Konsolidierung im Hintergrund**, wenn das Wallet idle ist und Gas
  billig (verhindert Fragmentierung → spätere Zahlungen brauchen weniger Inputs = kleinere
  Proofs).

### Durchsatz / Skalierung
- **[Struktur]** Rekursive Aggregation auch für den Settlement-Pfad → ein Verify deckt
  Hunderte Zahlungen.
- **[Struktur, langfristig]** Bei hohem Volumen Pool als **App-Chain / Validium** mit
  periodischem State-Commitment auf der Settlement-L2 — entkoppelt Zahlungsdurchsatz vom
  L2-Gas vollständig.

### Privacy-Qualität (Anonymitäts-Set)
- **[Quick Win]** Onramp-Käufe **default** in den Pool → Set wächst organisch; Privacy
  steigt mit Nutzerzahl.
- **[Quick Win]** Einheitliche Stückelungen + Decoy-Outputs + randomisierte Relayer-Delays
  (verflacht Betrags-/Timing-Fingerprints, §6).
- **[Struktur]** Mindest-Set-Größe pro Asset überwachen; bei zu kleinem Set warnen/poolen.

### UX / Recovery
- **[Quick Win]** Note-Sync via Viewing-Key + verschlüsselter lokaler Cache für schnellen
  Wallet-Start.
- **[Quick Win]** Seed-basierte Recovery (Notes aus Chain-History rekonstruierbar) → kein
  Extra-Backup nötig.
- **[Struktur]** Spending-Session (§10d) für Tap-to-pay-Geschwindigkeit.

> **Faustregel der Positionierung:** Ausschließlich auf den großen **L2 (Polygon/Base/
> Arbitrum)** ausspielen (Gas-Mehrkosten ≈ Cent), Latenz über **kleine Notes + Hintergrund-
> Proving** verstecken (~1–2 s, gefühlt 0), und den größten strukturellen Hebel — **rekursive
> Aggregation** — als Skalierungs-Roadmap-Punkt einplanen, sobald Volumen es rechtfertigt.

---

## 12. Implementierbarkeit durch Dritte (offener Standard, kein Lock-in)

**Designziel:** Cloister ist so konzipiert, dass **jedes Wallet und jeder
Zahlungsanbieter/PSP es implementieren kann** — ohne Erlaubnis oder Abhängigkeit von DFX.
DFX ist der **Referenz-Betreiber** der Rollen, nicht eine fest verdrahtete Voraussetzung.

### 12.1 Rollen ≠ Betreiber
Das Protokoll definiert **Rollen** als Schnittstellen; jede Partei kann sie selbst betreiben
oder von DFX als Service beziehen:

| Rolle | Aufgabe | Wer kann sie betreiben |
|---|---|---|
| **Wallet** | Notes verwalten, zk-Proof bauen, einreichen | jedes Wallet via offener Spec + SDK |
| **Provider / PSP** | Quote erstellen, Händler settlen | jeder PSP (DFX, andere) |
| **ASP** (Compliance) | Association-Root/Policy signieren | jeder regulierte Anbieter; Policy pluggable |
| **Relayer** | Proof broadcasten, Gas zahlen | permissionless; jeder kann Relayer stellen |
| **Pool / Verifier** | On-chain Contracts | öffentlich deployt, von allen geteilt |

→ Ein fremder PSP kann den **gleichen Pool** nutzen und nur **eigenen Provider + eigenen ASP**
mitbringen. DFXs Geschäftswert ist der **Betrieb** (Managed Relayer/ASP/Settlement + SLA),
nicht technischer Lock-in.

### 12.2 Worauf man implementiert (offene Primitive)
Alles standardisierbar und nachbaubar:
- **Protokoll-Spec:** die „Shielded Methods"-Erweiterung von OpenCryptoPay (additiv zu
  `transferAmounts`, §4/§9 in `ARCHITECTURE.md`) — Teil des offenen OCP-Standards.
- **Krypto-Primitive:** Groth16/BN254, Poseidon, BabyJubJub, definierte Circuit-Familie +
  Public-Input-Layout → jeder kann einen kompatiblen Prover/Verifier bauen.
- **Contracts/Circuits:** Open Source, öffentlich verifizierbarer Trusted-Setup; Registry
  `chainId → {pool, verifier, asset-liste}` öffentlich.
- **SDK:** Referenz-Implementierung (Key-Ableitung, Note-Mgmt, Proof-Gen, Event-Scan) als
  Bibliothek — Integration ohne DFX-Backend möglich.

### 12.3 Konformitäts-Stufen (Wallet/PSP können schrittweise andocken)
- **Level 0 — klassisch:** heutiger OCP-Flow (kein Shield). Volle Rückwärtskompatibilität.
- **Level 1 — Payer-Privacy:** shielded `transact` (Zahler-Wallet verborgen). Mindeststufe
  für das Schutzversprechen P1/P2.
- **Level 2 — Betrag/Timing:** + Aggregat-Settlement / verborgene Beträge (P3).
- **Level 3 — Compliance-fähig:** + ASP-Inclusion-Proofs + Viewing-Key-Disclosure (für
  regulierte Anbieter).
Ein Wallet meldet seine unterstützten Level; das Protokoll handelt die höchste gemeinsame
Stufe pro Zahlung aus (über das `shielded`-Flag in `transferAmounts`).

### 12.4 Kritischer Punkt: gemeinsamer Pool vs. Fragmentierung
Privacy lebt von der **Größe des Anonymitäts-Sets**. Wenn jeder PSP einen *eigenen* Pool
deployt, zersplittern die Sets → schwächere Privacy für alle. Daher:
- **Empfehlung: ein kanonischer, geteilter Pool pro Chain+Asset**, den alle Wallets/PSPs
  nutzen; **Compliance wird darüber gelegt** (jeder ASP signiert seine eigene
  Association-Sicht auf denselben Pool), nicht durch separate Pools erzwungen.
- Governance des kanonischen Pools (Upgrade, Verifier-Version, Notfall-Freeze) muss
  **neutral/multi-stakeholder** sein, damit Dritte ihm vertrauen — sonst bauen sie eigene
  Pools und die Privacy fällt. Das ist die zentrale Standardisierungs-Aufgabe.
- Voraussetzung für Interop: **identische Circuit-Version + Verifier + Poseidon-Parameter**
  über alle Implementierungen (sonst inkompatible Commitments).

### 12.5 Konsequenz
Konzeptionell: **ja, von jedem implementierbar.** Damit es real wird, sind drei Dinge
Pflicht-Deliverables (heute Roadmap, sollten priorisiert werden):
1. Die „Shielded Methods"-**Spec** offen einbringen (OCP-Standard).
2. **Contracts/Circuits/SDK** Open Source + öffentlicher Trusted-Setup.
3. **Neutrale Governance** des kanonischen Pools pro Chain, damit Dritte denselben
   Anonymitäts-Set teilen statt zu fragmentieren.
