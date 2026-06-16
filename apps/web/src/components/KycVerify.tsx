// Account-based identity verification (KYC) for the dashboard.
// Connect or create a regulated account, complete KYC in its flow, and we mark
// the local session verified. Reused by the Overview banner and the
// Compliance Center card.

import { DfxConnect } from "./DfxConnect";
import { useApi } from "../lib/ApiProvider";
import { useSession } from "../lib/SessionProvider";

export function KycVerify({ onDone }: { onDone?: () => void }) {
  const api = useApi();
  const { setSession } = useSession();

  async function done(level?: "L1" | "L2" | "L3") {
    // record the real DFX KYC tier on the session
    setSession(await api.markVerifiedExternally({ level }));
    onDone?.();
  }

  return <DfxConnect onVerified={done} />;
}
