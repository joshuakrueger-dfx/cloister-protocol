import { BackendSwitcher } from "./BackendSwitcher";
import { useSession } from "../lib/SessionProvider";
import { getActiveBackendId } from "../lib/backends";

// crumb + Titel kommen pro Route; chain-chip / jurisdiction- / KYC-pill
// spiegeln die Topbar des Prototyps.
export function Topbar({
  crumb,
  title,
  onMenu,
}: {
  crumb: string;
  title: string;
  onMenu: () => void;
}) {
  const { session } = useSession();
  const kyc = session?.kyc.status ?? "unverified";
  const jurisdiction = session?.kyc.jurisdiction ?? null;
  const kycLevel: "ok" | "warn" | "bad" =
    kyc === "verified" ? "ok" : kyc === "pending" ? "warn" : "bad";
  const kycLabel =
    kyc === "verified"
      ? `${jurisdiction ? `${jurisdiction} · ` : ""}KYC verified`
      : kyc === "pending"
        ? "KYC pending"
        : "KYC required";

  return (
    <div className="topbar">
      <div className="topbar-inner">
      <button className="menu-btn" onClick={onMenu} aria-label="Open navigation">
        ☰
      </button>
      <div>
        <div className="crumb">{crumb}</div>
        <h1>{title}</h1>
      </div>
      <div className="spacer" />
      {getActiveBackendId() === "demo" ? (
        <span className="status-pill status-warn" title="Demo backend — all figures are illustrative sample data, not real.">
          SAMPLE DATA
        </span>
      ) : null}
      <span className="chip hide-sm">Supports Base · Polygon · Arbitrum</span>
      <span className={`status-pill status-${kycLevel}`}>{kycLabel}</span>
      <BackendSwitcher />
      </div>
    </div>
  );
}
