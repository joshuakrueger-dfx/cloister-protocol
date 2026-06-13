// Session-State (Auth) als Context. Hält die aktuelle Session und stellt
// Setter bereit, die der Auth-Flow + die Topbar nutzen.

import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { Session } from "./types";
import { useApi } from "./ApiProvider";

interface SessionCtx {
  session: Session | null;
  ready: boolean;
  setSession: (s: Session) => void;
}

const Ctx = createContext<SessionCtx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .getSession()
      .then((s) => alive && setSession(s))
      .finally(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, [api]);

  return <Ctx.Provider value={{ session, ready, setSession }}>{children}</Ctx.Provider>;
}

export function useSession(): SessionCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSession must be used within <SessionProvider>");
  return ctx;
}
