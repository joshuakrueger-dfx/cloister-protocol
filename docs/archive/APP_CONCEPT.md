# Cloister App — Concept

> Compliant private **disbursements & settlement console** for the Cloister privacy layer.
> Web app. Sender-side of payments — where privacy *and* compliance both matter.
> Status: Concept v0.1 · 2026-06-13

---

## 1. Positioning

OpenCryptoPay already covers the **consumer checkout** (POS → QR → wallet pays). The
Cloister App is **not another consumer wallet** — it is the front-end for everyone who
**sends / pays out / settles** and needs the payer–payment link broken while staying fully
auditable:

- **Private merchant payments at checkout** (single payment)
- **DAO contributor payouts** (batch)
- **B2B settlements without an exposed counterparty**
- **Payroll-style transfers** (recurring batch)
- **Cross-chain private checkout**
- **Oracle / automated programmatic payouts** (API)

Core principle: **privacy for the payer, compliance for the regulator.** Every flow is
**Level 3 compliant** (ARCHITECTURE §5): KYC-gated shield, ASP inclusion/exclusion,
viewing-key disclosure, OFAC + geofence enforced at the *public edge* (the shield), never at
the private pay step. DFX is the reference compliance operator; the app is the front-end.

## 2. Compliance posture (EU + USA)

Compliance is the product, not a feature. The Tornado-Cash lesson: never an anonymous mixer.

| Jurisdiction | Regime | How the app satisfies it |
|---|---|---|
| **EU** | MiCA (CASP), AMLR + Travel Rule (TFR), GDPR | KYC at onramp/shield; Travel-Rule payload handled off-chain via viewing-key disclosure; GDPR data-minimisation = no plaintext on-chain, selective disclosure only |
| **USA** | FinCEN / BSA (MSB), OFAC, state money-transmitter | Sanctions screening + geofence at shield; ASP **exclusion** of bad-set; per-jurisdiction function gating for US persons |

The **public touchpoint** (shield/fund) is the single place where KYC, sanctions screening
and geofencing run. After that, payments are private but every one carries an **ASP
inclusion proof** ("clean funds") and is recoverable via the owner's **viewing key**.

## 3. App surface (web)

Left-nav console, Cloister dark/Swiss design language (reuses `website/index.html` tokens).

1. **Overview** — shielded treasury (privacy-toggle), anonymity-set "privacy meter" per
   chain/asset, compliance status (KYC ✓, ASP root age, jurisdiction profile, OFAC on),
   recent disbursements, quick actions.
2. **Fund (Shield)** — load budget from DFX onramp / public address. The compliance gate:
   KYC verified · sanctions pass · jurisdiction allowed. The only public touchpoint.
3. **Disburse (Pay)** — three modes:
   - **Single** — checkout / B2B settlement; background proof starts while the operator
     confirms (felt latency ≈ 0, CONCEPT §10c).
   - **Batch** — DAO payouts / vendor runs; recipient list (CSV), N private payments, one
     aggregated settlement, per-recipient compliance check.
   - **Recurring** — payroll schedules.
4. **Recipients** — address book with viewing-key-encrypted labels; counterparty never
   exposed on-chain.
5. **Activity** — viewing-key-decrypted own ledger (read-only), filter, export.
6. **Compliance Center** (the differentiator):
   - **Compliance Receipt / Proof-of-Innocence** — signed attestation that funds ∈
     `associationRoot` + KYC origin, per payment or period, **without** revealing history.
   - **Scoped Viewing-Key Disclosure** — time/scope-limited read tokens for auditor / bank
     / tax authority; list + revoke.
   - **ASP status** — association root freshness, inclusion health, bad-set exclusion.
   - **Jurisdiction profiles** — EU / US rule toggles; audit-log export.
7. **Settings** — keys/seed (self-custody), relayer + registry config, white-label.

## 4. Own ideas baked in

- **Spending-Session / programmatic mode** — pre-authorise a budget (session key with limit
  + expiry, bound in the circuit) so batch/oracle payouts run near-instant (CONCEPT §10d).
- **Compliance Receipt** as a first-class, exportable artifact — the bank/auditor-facing
  anti-Tornado proof.
- **Privacy meter** — surfaces anonymity-set size; warns on weak sets (CONCEPT §11).
- **Background note consolidation** when idle → smaller proofs, faster payouts.
- **Counterparty shielding** — B2B settlement where the counterparty address never appears.

## 5. Tech

- **Front-end:** web app (Vite + framework or progressive-enhancement HTML), Cloister design
  tokens. Prototype: self-contained `apps/web/index.html`.
- **Crypto:** `@cloister/sdk` browser build + `prover-webview` snarkjs engine (~2.4 s Groth16,
  already validated) — background/optimistic proving.
- **Data path:** `OcpClient` (quote → tx-details → submit) + indexer (note discovery via
  view-tags) + relayer (gas, broadcast).
- **Self-custody:** seed → spend/view/nullifier keys; viewing-key for recovery + disclosure.

## 6. Build order

1. Prototype (this) — clickable high-fidelity shell, all screens, mock data.
2. Wire SDK browser build: real keys, note sync from indexer, balance.
3. Single disburse end-to-end against local relayer (real proof).
4. Batch + Compliance Receipt + scoped disclosure.
5. Jurisdiction profiles + audit export; programmatic/oracle API.
</content>
</invoke>
