import { NavLink, useLocation } from "react-router-dom";
import { Icon, Logo } from "./icons";
import type { IconName } from "./icons";
import { useSession } from "../lib/SessionProvider";
import { useApi } from "../lib/ApiProvider";
import { useAsync } from "../lib/useAsync";
import { useT } from "../lib/i18n";

const NAV_DE: Record<string, string> = {
  Overview: "Übersicht", Fund: "Einzahlen", Disburse: "Auszahlen", Approvals: "Freigaben",
  Recipients: "Empfänger", Activity: "Aktivität", "Compliance Center": "Compliance-Center",
  "Master data": "Stammdaten", Settings: "Einstellungen",
};
const SEC_DE: Record<string, string> = { OPERATE: "BETRIEB", COMPLIANCE: "COMPLIANCE" };

interface NavDef {
  to: string;
  label: string;
  icon: IconName;
  badge?: string;
}

const OPERATE: NavDef[] = [
  { to: "/overview", label: "Overview", icon: "grid" },
  { to: "/fund", label: "Fund", icon: "shield" },
  { to: "/disburse", label: "Disburse", icon: "send" },
  { to: "/approvals", label: "Approvals", icon: "check" },
  { to: "/recipients", label: "Recipients", icon: "users" },
  { to: "/activity", label: "Activity", icon: "list" },
];
const COMPLIANCE: NavDef[] = [
  { to: "/compliance", label: "Compliance Center", icon: "doc" },
  { to: "/team", label: "Team", icon: "users" },
  { to: "/masterdata", label: "Master data", icon: "list" },
  { to: "/settings", label: "Settings", icon: "cog" },
];

function Section({ title, items, onNav }: { title: string; items: NavDef[]; onNav: () => void }) {
  const tr = useT();
  return (
    <>
      <div className="navsec">{tr(title, SEC_DE[title] ?? title)}</div>
      {items.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          className={({ isActive }) => `nav-item${isActive ? " on" : ""}`}
          onClick={onNav}
        >
          <span className="ic">
            <Icon name={n.icon} />
          </span>
          {tr(n.label, NAV_DE[n.label] ?? n.label)}
          {n.badge ? <span className="badge">{n.badge}</span> : null}
        </NavLink>
      ))}
    </>
  );
}

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { session } = useSession();
  const api = useApi();
  const loc = useLocation();
  const org = session?.org ?? { name: "Your Treasury", kind: "Treasury · self-custody" };
  // Badge reflects the real KYC level — only shown once screening passed.
  const level = session?.kyc.status === "verified" ? session.kyc.level ?? undefined : undefined;
  const compliance: NavDef[] = COMPLIANCE.map((n) =>
    n.to === "/compliance" ? { ...n, badge: level } : n,
  );
  // Pending-approval count (refreshes on navigation).
  const { data: approvals } = useAsync(() => api.getApprovals(), [loc.pathname]);
  const pending = (approvals ?? []).length;
  const operate: NavDef[] = OPERATE.map((n) =>
    n.to === "/approvals" && pending > 0 ? { ...n, badge: String(pending) } : n,
  );
  return (
    <aside className={`sidebar${open ? " open" : ""}`}>
      <div className="brand">
        <Logo />
        <span>
          CLOISTER
          <br />
          <span className="sub">CONSOLE</span>
        </span>
      </div>

      <Section title="OPERATE" items={operate} onNav={onClose} />
      <Section title="COMPLIANCE" items={compliance} onNav={onClose} />

      <div className="nav-foot">
        <div className="org">
          <div className="av">{org.name.charAt(0)}</div>
          <div className="meta">
            <b>{org.name}</b>
            <span>{org.kind}</span>
          </div>
        </div>
        <div className="copyright">© 2026 Cloister Protocol · All rights reserved</div>
      </div>
    </aside>
  );
}
