import { BackendSwitcher } from "./BackendSwitcher";
import { useSession } from "../lib/SessionProvider";

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
      <button className="menu-btn" onClick={onMenu} aria-label="Open navigation">
        ☰
      </button>
      <div>
        <div className="crumb">{crumb}</div>
        <h1>{title}</h1>
      </div>
      <div className="spacer" />
      <span className="chip hide-sm">Base · Polygon · Arbitrum</span>
      <span className={`status-pill status-${kycLevel}`}>
        <span className={`d ${kycLevel}`} />
        {kycLabel}
      </span>
      <BackendSwitcher />
    </div>
  );
}
