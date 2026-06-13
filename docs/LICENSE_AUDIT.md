# Cloister — Lizenz-Audit & Rebuild-Plan

Stand: 2026-06-13. Ziel: Cloister sauber als eigenes (MIT) DFX-Produkt ausliefern. Dazu muss
jeder fremd-lizenzierte (v.a. GPL) Bestandteil entweder entfernt, ersetzt oder bewusst akzeptiert
und korrekt deklariert werden.

Repo deklariert aktuell **MIT** (`package.json`, README „MIT (PoC)"), liefert aber GPL-Code mit →
diese Selbstdeklaration ist derzeit faktisch falsch.

Legende Severity: **T1** = GPL-Code liegt physisch im Repo / im verteilten Bundle (harter Blocker).
**T2** = GPL-Dependency via npm, zur Laufzeit/Build genutzt. **T3** = Design-Abstammung/Attribution
(geringes Rechtsrisiko, Hygiene). **T4** = Meta/Deklaration.

---

## T1 — GPL-Code physisch im Repo / Bundle (harte Blocker)

### T1.1 `packages/contracts/contracts/TransactionVerifier.sol`
- **Lizenz:** GPL-3.0. Header: „Copyright 2021 0KIMS association … generated with snarkJS … GNU GPL v3".
- **Herkunft:** Auto-generiert von snarkjs (iden3/0KIMS) aus der Verifying-Key.
- **Risiko:** GPL-Datei eingecheckt im ansonsten als MIT deklarierten Contracts-Paket. Wird mit dem
  Produkt deployed/verteilt → Copyleft greift.
- **Rebuild:** Eigener MIT-Groth16-Verifier. Die Pairing-Check-Mathematik (BN254, ~150 Zeilen) ist
  öffentlich/nicht schützbar; nur die Verifying-Key-Konstanten einsetzen. Clean-room neu schreiben.

### T1.2 `packages/prover-webview/snarkjs.min.js`
- **Lizenz:** GPL-3.0 (iden3 snarkjs), 688 KB, direkt ins Repo kopiert (vendored).
- **Risiko:** GPL-Bibliothek wird mit dem WebView-Prover ausgeliefert.
- **Rebuild:** Siehe T2.2 (Prover-Strategie). Vendored Copy entfernen; Prover als getrennte Komponente.

### T1.3 `packages/prover-webview/cloister-sdk.browser.js`
- **Lizenz-Problem:** 3,9 MB esbuild-Bundle, das **circomlibjs (GPL-3.0) inline einkompiliert**
  (22 GPL/iden3-Fundstellen im Bundle, u.a. `buildPoseidon`, `buildBabyjub`).
- **Risiko:** Verteiltes Derivat mit GPL-Anteil → Bundle kann nicht MIT sein.
- **Rebuild:** Nach Swap der SDK-Quellen (T2.1) neu bündeln → GPL-frei.

---

## T2 — GPL-Dependencies via npm (Laufzeit/Build)

### T2.1 `circomlibjs` — GPL-3.0 (npm-Feld)
- **Genutzt in:** `packages/sdk/src/poseidon.js` (`buildPoseidon`), `packages/sdk/src/curve.js`
  (`buildBabyjub`); `packages/contracts` devDep; `apps/demo` dep.
- **Rebuild (leicht):**
  - Poseidon-Hash → **`poseidon-lite` (MIT)** — ist bereits als Dep vorhanden.
  - BabyJubJub → **`@noble/curves` (MIT)** oder **`@zk-kit/baby-jubjub` (MIT)**.

### T2.2 `snarkjs` — GPL-3.0
- **Genutzt in:** `packages/sdk/src/prover.js` (`groth16`); `packages/circuits` & `apps/demo` devDep;
  vendored als T1.2.
- **Das ist der harte Fall.** Für Groth16 + circom-Witness gibt es keinen drop-in MIT-Prover in JS.
  Optionen:
  - **(a) Mere-Aggregation:** snarkjs nur als externes Build-/Setup-Tool behandeln (Trusted Setup,
    Key-Generierung), NICHT mit dem Produkt verteilen. Proof-Erzeugung im Produkt über (b)/(c).
  - **(b) rapidsnark — LGPL-3.0** (schwächeres Copyleft, Linking erlaubt; ist ohnehin der Prod-Pfad).
    Akzeptabel mit korrekter Attribution + dynamischem Linking.
  - **(c) Proving-System wechseln:** **gnark (Apache-2.0, Go)** oder arkworks (MIT/Apache, Rust) →
    voller Umbau der Proof-Pipeline, größter Aufwand, aber 100 % permissiv.
- **Entscheidung nötig** (siehe unten).

### T2.3 `ffjavascript` — GPL-3.0
- **Genutzt in:** `packages/circuits` Build (devDep), transitiv über snarkjs/circomlibjs.
- **Rebuild:** Entfällt automatisch, sobald circomlibjs/snarkjs aus dem verteilten Pfad raus sind
  (bleibt ggf. reines Build-Tool).

### T2.4 `circomlib` — npm-Feld GPL-3.0 / GitHub-Repo LGPL-3.0 (Ambiguität!)
- **Genutzt in:** `include "circomlib/circuits/{poseidon,babyjub,comparators,mux1,bitify}.circom"` in
  `keypair.circom`, `merkleProof.circom`, `transaction.circom`. Kompilierte R1CS/WASM = Derivat.
- **Risiko:** Die zwei widersprüchlichen Lizenzangaben sind selbst ein Problem. LGPL-„Linking" ist für
  Circuits juristisch ungeklärt.
- **Rebuild:** circomlib-Includes durch **`zk-kit` / `zk-kit.circom` (MIT, PSE)** ersetzen; für
  Poseidon-Template ggf. MIT-Reimplementierung (Konstanten stammen aus dem öffentlichen Poseidon-Paper).
  comparators/bitify/mux1 sind triviale, neu schreibbare Templates.

---

## T3 — Design-Abstammung & Attribution (geringes Rechtsrisiko, Hygiene)

### T3.1 Tornado-Nova-Abstammung
- **Fingerprints im Code:**
  - `ZERO_VALUE = 21663839…421292` = `keccak256("tornado") mod p` — in `transaction.circom`,
    `sdk/src/constants.js`, und dem Browser-Bundle.
  - Contract-/Konzeptname **`MerkleTreeWithHistory`** (Kommentar in `sdk/src/constants.js`).
  - Note/Nullifier-Schema: `commitment = Poseidon(amount, pubKey, blinding)`,
    `nullifier = Poseidon(commitment, pathIndices, Poseidon(privKey, commitment, pathIndices))` —
    identisch zu Tornado Nova.
- **Lizenzlage der Quelle:** tornado-core = **GPL-3.0**; tornado-nova = im `package.json` **ISC**
  deklariert, aber **ohne LICENSE-File** (ambig). Der `keccak256("tornado")`-Wert stammt aus
  tornado-core (GPL).
- **Risiko:** Architektur/Ideen sind nicht urheberrechtlich geschützt — nur *literaler* Code. Da unsere
  `.circom`/`.sol` eigenständig getippt sind, ist das Risiko gering. Aber der hartkodierte
  Tornado-Konstant + Name sind ein nachweisbarer Abstammungs-Fingerprint → entfernen.
- **Rebuild:** Eigener `ZERO_VALUE` (z.B. `keccak256("cloister") mod p`) konsistent in Circuit/SDK/
  Contract; `MerkleTreeWithHistory` umbenennen; Clean-room-Header + NOTICE mit ehrlicher Nennung
  „inspiriert von Tornado-Nova-Architektur".

### T3.2 Railgun / Aztec / Privacy Pools — geprüft, NICHT im Code
- **Kein** Railgun-/Aztec-/Webb-/Semaphore-/MACI-Code oder -Marker gefunden (Grep negativ).
- Zur Info, falls später jemand Code von dort ziehen will:
  - **Railgun-Privacy/contract = `UNLICENSED`** (proprietär, alle Rechte vorbehalten) → NICHT
    verwendbar. Railgun-Community/engine = MIT; private-proof-of-innocence = GPL-3.0.
  - **Aztec = Apache-2.0**; **0xbow privacy-pools-core = Apache-2.0** (beide permissiv, verwendbar
    mit Attribution).

---

## T4 — Deklaration

### T4.1 Kein root `LICENSE`-File, aber MIT deklariert
- `package.json` + README behaupten MIT, während GPL-Artefakte (T1) mitgeliefert werden.
- **Rebuild:** Nach Bereinigung von T1/T2 ein echtes `LICENSE` (MIT) + `THIRD_PARTY_LICENSES.md` /
  `NOTICE` für die verbleibenden permissiven Deps (OZ, ethers, noble, poseidon-lite, tweetnacl,
  ggf. rapidsnark LGPL) anlegen.

---

## Sauber (keine Aktion)

OpenZeppelin (MIT), ethers (MIT), @noble/hashes (MIT), poseidon-lite (MIT),
tweetnacl (Unlicense / public domain), react/react-dom/react-router/vite/typescript (MIT).

---

## Rebuild-Reihenfolge (Vorschlag)

1. **JS-SDK GPL-frei machen (leicht, hoher Hebel):** `poseidon.js` → poseidon-lite; `curve.js` →
   @noble/curves/@zk-kit. circomlibjs aus allen `package.json` raus. → erledigt T2.1.
2. **Browser-Bundle neu bauen** → erledigt T1.3.
3. **MIT-Groth16-Verifier** hand-geschrieben → erledigt T1.1.
4. **Circuits:** circomlib-Includes → zk-kit (MIT) + MIT-Poseidon-Template → erledigt T2.4.
5. **Prover-Entscheidung** (T2.2 a/b/c) umsetzen → erledigt T1.2/T2.3.
6. **Tornado-Fingerprints** entfernen (ZERO_VALUE, Naming) → erledigt T3.1.
7. **LICENSE + NOTICE** schreiben → erledigt T4.

**Offene Entscheidung (blockt Schritt 5):** Prover-Strategie — (a) snarkjs nur als Setup-Tool +
rapidsnark (LGPL) im Prod, (b) rapidsnark generell, oder (c) Wechsel auf gnark (Apache).
