# Cloister — Fallbacks & Resilienz

Designziel: **eine Zahlung darf niemals hängen bleiben und niemals doppelt submitten**, in
jedem Netzwerk (VPN, Mobilfunk, fremdes WLAN, instabiler Relayer). Zwei unabhängige
Fallback-Ketten plus Idempotenz machen den Ablauf robust.

## 1. Proving

- **Produktion (Wallet)**: natives On-Device-Modul (`cloister-prover`). In einem
  ordentlichen Dev-/Release-Build stets vorhanden; das Witness bleibt auf dem Gerät.
- **Dev / CI / Node**: HTTP-Backend `proverd`.
- **Web (`apps/web`)**: ein gnark-WASM-Backend für den Browser-Kontext ist auf der Roadmap;
  die Prover-Bibliothek unterstützt bereits In-Memory-Key-Loading (`prover.LoadFrom`), um dies
  zu ermöglichen.
- Das SDK wählt das Backend über `setHashBackend` / `setProveBackend`; die Wallet verdrahtet
  das native Modul einmalig (`wireCloisterNativeBackend`). Ist das native Modul nicht
  verfügbar, wirft das SDK einen **klaren, handlungsleitenden Fehler**, statt still zu
  degradieren.

## 2. Submission (`submitShielded`, `packages/sdk/src/submit.js`)

Reihenfolge der Operationen, allesamt timeout-begrenzt durch `perCallMs` und ein
übergreifendes `deadlineMs`:

0. **Idempotenz-Vorabprüfung** — Abfrage von `nullifierSpent(nf0)` auf der Chain über den
   ersten erreichbaren RPC. Ist der Nullifier bereits ausgegeben, ist genau diese Transaktion
   gelandet (der Nullifier ist eindeutig für diese Note+Spend) → Rückgabe `already-onchain`.
   Dies ist die Anti-Doppel-Submit-Garantie, die jeden nachfolgenden Retry sicher macht.
1. **Relayer-Endpoints** (datenschutzwahrend) — der Reihe nach versucht, `maxRounds`-mal, mit
   exponentiellem Backoff (0.5s → 1s → 2s …). Nach jedem Relayer-Fehler wird die
   Idempotenzprüfung erneut ausgeführt (die Transaktion kann trotz verlorener Antwort gelandet
   sein).
2. **Direct-RPC-Fallback** (Opt-in, `allowDirect`) — der Nutzer submittet über den ersten
   erreichbaren RPC. Garantiert Liveness, wenn alle Relayer ausgefallen sind, um den Preis,
   den Sender preiszugeben. **Standardmäßig deaktiviert.**

Schlägt alles innerhalb der Deadline fehl, wird geworfen — niemals gehängt — sodass der
UI-Watchdog stets auflöst.

## 3. Tree-Sync (`syncWithFallback`, `packages/sdk/src/sync.js`)

- Bevorzugt wird der **Indexer** (schnell, View-Tag-gefiltert), jede URL timeout-begrenzt.
- Bei Fehlschlag **direkter On-Chain-Scan** der `NewCommitment`-Events über den Pool-Contract.
- Wirft nur, wenn jeder Indexer ausgefallen ist *und* kein Pool angegeben wurde.

## 4. UI-Watchdogs (Wallet-Pay-Screen)

Der Pay-Screen führt unabhängige Watchdog-Timer: ein Prepare-Fenster, ein Prover-Ready-Fenster
und ein übergreifendes Pay-Fenster. Jeder Stall löst einen klaren, wiederholbaren Fehler aus.
Ein verspäteter Timer kann ein bereits entschiedenes Ergebnis (paid/failed/cancelled) niemals
überschreiben.

## Warum dies "Bezahlen über VPN nicht möglich" erfüllt

Das Proving ist lokal (kein Netzwerk nötig). Der einzige Netzwerkschritt ist die Submission,
die über mehrere Relayer, einen Opt-in-Direktpfad, Retries mit Backoff und Idempotenz verfügt
— sodass ein einzelner toter Endpoint, ein Captive-VPN oder eine verlorene Antwort eine
Zahlung weder stranden lassen noch duplizieren können.
