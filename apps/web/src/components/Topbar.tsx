import { BackendSwitcher } from "./BackendSwitcher";
import { useSession } from "../lib/SessionProvider";
import { getActiveBackendId } from "../lib/backends";
import { useLang, setLang, useT } from "../lib/i18n";

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
  const lang = useLang();
  const tr = useT();
  const kyc = session?.kyc.status ?? "unverified";
  const jurisdiction = session?.kyc.jurisdiction ?? null;
  const kycLevel: "ok" | "warn" | "bad" =
    kyc === "verified" ? "ok" : kyc === "pending" ? "warn" : "bad";
  const kycLabel =
    kyc === "verified"
      ? `${jurisdiction ? `${jurisdiction} · ` : ""}${tr("KYC verified", "KYC verifiziert")}`
      : kyc === "pending"
        ? tr("KYC pending", "KYC ausstehend")
        : tr("KYC required", "KYC erforderlich");

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
        <span className="status-pill status-warn" title={tr("Demo backend — all figures are illustrative sample data, not real.", "Demo-Backend — alle Zahlen sind beispielhafte Musterdaten, nicht echt.")}>
          {tr("SAMPLE DATA", "BEISPIELDATEN")}
        </span>
      ) : null}
      <span className="chip hide-sm">{tr("Supports", "Unterstützt")} Base · Polygon · Arbitrum</span>
      <span className={`status-pill status-${kycLevel}`}>{kycLabel}</span>
      <div className="lang-seg" role="group" aria-label="Language">
        <button className={lang === "de" ? "on" : ""} onClick={() => setLang("de")}>DE</button>
        <button className={lang === "en" ? "on" : ""} onClick={() => setLang("en")}>EN</button>
      </div>
      <BackendSwitcher />
      </div>
    </div>
  );
}
