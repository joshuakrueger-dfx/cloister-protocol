// React-Context für die aktive CloisterApi-Instanz + Backend-Umschaltung.
//   demo            → MockApi (immer verfügbar, keine Infrastruktur)
//   local/testnet   → RealApi gegen den jeweiligen Stack (@cloister/sdk + Relayer/ASP)

import { createContext, useContext, useMemo, useState, useCallback } from "react";
import type { ReactNode } from "react";
import type { CloisterApi } from "./api";
import { MockApi } from "./mockApi";
import { RealApi } from "./realApi";
import { getActiveBackendId, setActiveBackendId, getBackendConfig } from "./backends";

function makeApi(backendId: string): CloisterApi {
  const cfg = getBackendConfig(backendId);
  return cfg.kind === "mock" ? new MockApi() : new RealApi(cfg);
}

interface ApiCtx {
  api: CloisterApi;
  backendId: string;
  switchBackend: (id: string) => void;
}

const Ctx = createContext<ApiCtx | null>(null);

export function ApiProvider({ children }: { children: ReactNode }) {
  const [backendId, setBackendId] = useState<string>(() => getActiveBackendId());
  // Eine API-Instanz pro Backend; Wechsel baut neu auf (frischer State + Session-Refresh).
  const api = useMemo<CloisterApi>(() => makeApi(backendId), [backendId]);

  const switchBackend = useCallback((id: string) => {
    setActiveBackendId(id);
    setBackendId(id);
  }, []);

  const value = useMemo(() => ({ api, backendId, switchBackend }), [api, backendId, switchBackend]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApi(): CloisterApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useApi must be used within <ApiProvider>");
  return ctx.api;
}

export function useBackend(): { backendId: string; switchBackend: (id: string) => void } {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useBackend must be used within <ApiProvider>");
  return { backendId: ctx.backendId, switchBackend: ctx.switchBackend };
}
