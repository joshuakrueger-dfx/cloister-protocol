# @cloister/prover-webview

Browser/WebView-Prover für Cloister-Groth16-Proofs. Derselbe `cloister-prover.html` läuft im
Browser **und** in `react-native-webview` (Mobile). De-riskt den mobilen Prover für die
dfx-wallet-Integration (siehe `docs/INTEGRATION_DFX_WALLET.md`, WS3).

## Dateien
- `cloister-prover.html` — lädt snarkjs, exponiert `window.cloisterProve(witness, wasm, zkey)`
  und einen postMessage-Handler für RN (`{id, witnessInput, wasmUrl|wasmB64, zkeyUrl|zkeyB64}`).
- `snarkjs.min.js` — Browser-Bundle (snarkjs 0.7.6).
- `fixtures/` — Circuit-Artefakte (`transaction2.wasm`, `transaction2_final.zkey`,
  `verification_key.json`) + ein echter `witness.json` + erwartete `expected_public.json`.

## Lokal testen (Browser)
```bash
cd packages/prover-webview && python3 -m http.server 8799
# Browser → http://localhost:8799/cloister-prover.html, dann in der Konsole:
#   await cloisterProve(witness, './fixtures/transaction2.wasm', './fixtures/transaction2_final.zkey')
```

## Status
✅ In Chromium validiert: Proof erzeugt **und** verifiziert, Public Signals identisch zum
Node-SDK, **~2,4 s** (zkey 24 MB, wasm 2,4 MB als In-Memory-Bytes). RN-WebView nutzt dieselbe
Engine-Klasse → überträgt sich. Für Prod-Geschwindigkeit später rapidsnark nativ.
