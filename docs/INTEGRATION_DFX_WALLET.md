# Cloister × dfx-wallet — Integrationsplan

> Wie das Cloister-Protokoll ins dfx-wallet kommt, geerdet im echten Code
> (`~/DFXswiss/dfx-wallet`, Expo RN 0.81, WDK/ERC-4337, Passkey-Keys).
> Ziel: privat bezahlen an der Kasse, auf dem echten Gerät testbar.

Stand: 2026-06-12 · Status: Plan v0.1

---

## 0. Ausgangslage (Mapping-Ergebnis)

| Thema | Befund (Datei) | Konsequenz |
|---|---|---|
| Framework | Expo RN 0.81, React 19 | RN-Port des SDK nötig (kein Node) |
| EVM-Tx | **WDK (Tetherto), ERC-4337 Smart Accounts** (`src/hooks/useSendFlow.ts`) | Shield = WDK-Contract-Call; Pay braucht **keine** WDK-Signatur (Relayer broadcastet) |
| Keys | Passkey/PRF → Mnemonic, HKDF (`src/features/passkey/services/key-derivation.ts`) | Shielded-Keys per neuem HKDF-`info` ableiten |
| Pay-Screen | **Stub** „coming soon" (`src/features/pay/PayScreenImpl.tsx`) | Pay-Flow wird neu gebaut — direkt als Shielded-Flow |
| WASM/WebView | BitBox-WASM-WebView + RPC-Bridge (`src/features/hardware-wallet/services/{BitboxWasmWebView.tsx,wasm-bridge.ts}`) | **Muster für Prover wiederverwendbar** (Spike); fragil (#153) → Prod = rapidsnark |
| HTTP | simpler fetch-Wrapper (`src/features/dfx-backend/services/api.ts`) | Relayer/Indexer-Client trivial ergänzbar |
| Crypto da | `ethers@6`, `@noble/hashes`, `sodium-native/-javascript`, `react-native-quick-crypto` | Note-Enc via libsodium statt tweetnacl; Poseidon/BabyJub/snarkjs fehlen |

**Kernaussage:** Der OCP-/Protokoll-Teil dockt sauber an. Der eine echte Risikobaustein ist die
**Proof-Generierung auf dem Gerät**. Der Pay-Flow existiert noch nicht → wir bauen ihn als
Shielded-Pay.

---

## 1. Workstreams (mit Docking-Punkten)

### WS1 — Shielded Keys aus dem Seed
- **Wo:** `key-derivation.ts` erweitern.
- **Was:** `deriveShieldedKeys(seed)` → BabyJubJub-Spend-Skalar (HKDF `info='cloister-spend-v1'`,
  auf <2^253 maskiert) + Viewing-Key (libsodium x25519, `info='cloister-view-v1'`).
- **Speichern:** `StorageKeys.CLOISTER_SPEND_KEY` / `_VIEW_KEY` in SecureStore (expo-secure-store).
- Aufwand: klein.

### WS2 — RN-Port des SDK (`@cloister/sdk-rn`)
Portierung des Node-SDK (kein Rewrite, Shims):
- **Note-Enc:** tweetnacl → `sodium` `crypto_box` (View-Tag = sha256(shared)[0], identisch).
- **Poseidon/BabyJubJub:** `poseidon-lite` (pure JS) + pure-JS BabyJub *oder* im Prover-WebView
  rechnen. Müssen **bit-identisch** zum Circuit sein → Test-Vektoren gegen das Node-SDK.
- **Merkle/Notes/Prover-Glue:** pure TS, direkt portierbar.
- **Artefakte:** `transaction2.wasm` + `transaction2_final.zkey` als gebündelte Assets
  (`expo-asset`), nicht als Dateipfade.
- Aufwand: mittel.

### WS3 — Prover-Backend (der harte Teil)
- **Spike-Vorlauf erledigt** (`pnpm demo:spike`): (1) snarkjs erzeugt gültigen Proof aus
  **In-Memory-Bytes** (wasm 2,4 MB + zkey 24,4 MB als Uint8Array, kein fs) → der Bundled-Asset-/
  WebView-Fall funktioniert; (2) **poseidon-lite (pure JS) == circomlibjs** → RN-Client rechnet
  Notes/Nullifier **ohne WASM**. Offen bleibt nur das native Prover-Einbinden.
- **Spike (Schritt 2):** snarkjs im **versteckten WebView**, das BitBox-Muster
  (`BitboxWasmWebView` + `WasmBridge`) wiederverwenden → schnellster Weg zu „Proof auf dem Gerät".
- **Prod:** **rapidsnark** als natives iOS/Android-Modul (~1–2 s, robust). Empfehlung, weil die
  WASM-WebView laut #153 fragil ist.
- Interface: `generateProof(witnessInput) → {a,b,c, publicSignals}` — austauschbares Backend.
- Aufwand: hoch (= das Risiko, das der Spike de-riskt).

### WS4 — Pay-Flow (OCP „Shielded Method")
- **Wo:** `PayScreenImpl.tsx` + neuer `src/features/pay/services/pay-service.ts`.
- **Was:** QR decodieren (LNURL/EIP-681) → Payment-Details (`transferAmounts`) holen →
  wenn `shielded:true`: Tx-Details (Pool-Instruktion) holen → Proof bauen (WS3) → an Relayer
  POSTen. Sonst klassischer Pfad.
- **UX:** „Privat bezahlen"-Toggle; Quote→Confirm→Result-Muster aus `useBuyFlow.ts` wiederverwenden.
- Aufwand: mittel.

### WS5 — Shielded Balance (Aufladen/Auszahlen)
- **Aufladen (Shield):** `approve` + `pool.transact(extAmount>0)` als **WDK-Contract-Call** vom
  Smart Account (öffentlich, by design).
- **Tracking:** Indexer-Sync + View-Tag-Filter (aus dem SDK) → „Shielded Balance"-Karte.
- **Auszahlen (Unshield):** optionaler Flow.
- Aufwand: mittel.

### WS6 — Netzwerk-Clients & Config
- `relayerApi` + `indexerApi` analog zu `dfxApi` (fetch-Wrapper).
- `env.relayerUrl` / `env.indexerUrl` in `src/config/env.ts`; `FEATURES.SHIELDED_PAY`-Flag.
- Aufwand: klein.

---

## 2. ERC-4337-Hinweis
Der Pay-Schritt braucht **keine** On-chain-Signatur des Nutzers — der Relayer broadcastet den
Proof. Die Smart-Account-/Gas-Abstraktion blockiert also nicht. Nur der **Shield-Deposit** ist
ein Smart-Account-Call (über WDK). Das passt.

---

## 3. Meilensteine
- **M1 — Prover-Spike (Schritt 2):** Cloister-Groth16-Proof auf Gerät/Simulator erzeugen
  (WebView-Backend), gegen das Node-SDK verifiziert. *De-riskt WS3.*
- **M2 — SDK-RN + Keys:** WS1+WS2, Poseidon/BabyJub-Test-Vektoren grün, Note-Enc round-trip.
- **M3 — Shield + Indexer-Sync:** Shielded Balance aufladen + anzeigen (Testnet Base Sepolia).
- **M4 — Shielded Pay E2E:** QR→Proof→Relayer→Settlement, on-device.
- **M5 — On-device Trace-Audit:** das `demo:trace`-Äquivalent gegen Base Sepolia / Basescan.

## 4. Risiken
- **Mobiler Prover** (M1) — Hauptrisiko; rapidsnark für Prod einplanen.
- **Hash-Kompatibilität** Poseidon/BabyJub RN↔Circuit — durch Test-Vektoren absichern.
- **Fragile WASM-WebView** (#153) — nicht der Prod-Weg.
- **Produktivreife** bleibt an `PRODUCTION_READINESS.md` gekoppelt (Audit/Setup/Compliance) —
  Wallet-Integration zunächst **Dev/Testnet**.

## 5. dfx-wallet-Konventionen (für die Umsetzung)
- Feature-spezifischer Branch + PR gegen `develop`; **nicht** ungefragt pushen/PR öffnen.
- Divergente History alter Branches → nie rebasen, reset+reapply.
