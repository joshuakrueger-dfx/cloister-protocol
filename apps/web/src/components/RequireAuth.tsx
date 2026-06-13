import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useSession } from "../lib/SessionProvider";
import { CenterState } from "./primitives";

// Route-Guard: ohne authentifizierte/entsperrte Session → zum Onboarding.
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session, ready } = useSession();
  if (!ready) {
    return (
      <div className="auth-wrap">
        <CenterState>Loading session…</CenterState>
      </div>
    );
  }
  if (!session?.authenticated || !session.unlocked) {
    return <Navigate to="/welcome" replace />;
  }
  return <>{children}</>;
}
