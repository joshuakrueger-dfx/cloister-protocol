// Regulatorische Profile je Heimat-Jurisdiktion. Der Nutzer wählt bei der
// Registrierung EU oder US; danach werden nur die Regeln der gewählten Jurisdiktion
// angezeigt + angewendet (kein „EU + US"-Sammelprofil mehr).

import type { ComplianceItem, Jurisdiction } from "./types";

export const JURISDICTION_LABEL: Record<Jurisdiction, string> = {
  EU: "EU profile",
  US: "US profile",
};

export const JURISDICTION_PROFILES: Record<Jurisdiction, ComplianceItem[]> = {
  EU: [
    { label: "MiCA — CASP authorisation", value: "active", level: "ok" },
    { label: "AMLR / AMLD", value: "active", level: "ok" },
    { label: "Travel Rule (TFR)", value: "off-chain payload", level: "ok" },
    { label: "GDPR — data minimisation", value: "no plaintext on-chain", level: "ok" },
  ],
  US: [
    { label: "FinCEN / BSA (MSB)", value: "active", level: "ok" },
    { label: "OFAC sanctions screening", value: "at shield", level: "ok" },
    { label: "Travel Rule (FinCEN)", value: "off-chain payload", level: "ok" },
    { label: "State money-transmitter", value: "per-state", level: "ok" },
  ],
};
