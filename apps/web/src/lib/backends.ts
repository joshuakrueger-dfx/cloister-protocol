// Backend-Definitionen + aktive Auswahl (persistiert). "demo" = MockApi (immer verfügbar,
// keine Infrastruktur nötig); "local" + "base-sepolia" = RealApi gegen den jeweiligen Stack.

import type { Backend } from "./types";

export type BackendKind = "mock" | "real";

export interface BackendConfig {
  id: string;
  label: string;
  meta: string;
  kind: BackendKind;
  apiBase?: string; // Provider/Relayer/ASP (server.js / server-testnet.js)
}

export const BACKENDS: BackendConfig[] = [
  { id: "demo", label: "Demo", meta: "mock data", kind: "mock" },
  { id: "local", label: "Local", meta: "devnet", kind: "real", apiBase: "http://127.0.0.1:8788" },
  { id: "base-sepolia", label: "Base Sepolia", meta: "testnet", kind: "real", apiBase: "http://127.0.0.1:8790" },
];

const ACTIVE_KEY = "cloister.backend.v1";
const DEFAULT_ID = "local";

export function getActiveBackendId(): string {
  const id = localStorage.getItem(ACTIVE_KEY);
  return id && BACKENDS.some((b) => b.id === id) ? id : DEFAULT_ID;
}

export function setActiveBackendId(id: string): void {
  if (!BACKENDS.some((b) => b.id === id)) throw new Error(`unknown backend ${id}`);
  localStorage.setItem(ACTIVE_KEY, id);
}

export function getBackendConfig(id: string): BackendConfig {
  const b = BACKENDS.find((x) => x.id === id);
  if (!b) throw new Error(`unknown backend ${id}`);
  return b;
}

export function backendsView(): Backend[] {
  const active = getActiveBackendId();
  return BACKENDS.map((b) => ({ id: b.id, label: b.label, meta: b.meta, active: b.id === active }));
}
