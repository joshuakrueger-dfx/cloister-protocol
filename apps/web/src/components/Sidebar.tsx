import { NavLink } from "react-router-dom";
import { Icon, Logo } from "./icons";
import type { IconName } from "./icons";
import { useSession } from "../lib/SessionProvider";

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
  { to: "/recipients", label: "Recipients", icon: "users" },
  { to: "/activity", label: "Activity", icon: "list" },
];
const COMPLIANCE: NavDef[] = [
  { to: "/compliance", label: "Compliance Center", icon: "doc" },
  { to: "/settings", label: "Settings", icon: "cog" },
];

function Section({ title, items, onNav }: { title: string; items: NavDef[]; onNav: () => void }) {
  return (
    <>
      <div className="navsec">{title}</div>
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
          {n.label}
          {n.badge ? <span className="badge">{n.badge}</span> : null}
        </NavLink>
      ))}
    </>
  );
}

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { session } = useSession();
  const org = session?.org ?? { name: "Your Treasury", kind: "Treasury · self-custody" };
  // Badge reflects the real KYC level — only shown once screening passed.
  const level = session?.kyc.status === "verified" ? session.kyc.level ?? undefined : undefined;
  const compliance: NavDef[] = COMPLIANCE.map((n) =>
    n.to === "/compliance" ? { ...n, badge: level } : n,
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

      <Section title="OPERATE" items={OPERATE} onNav={onClose} />
      <Section title="COMPLIANCE" items={compliance} onNav={onClose} />

      <div className="nav-foot">
        <div className="org">
          <div className="av">{org.name.charAt(0)}</div>
          <div className="meta">
            <b>{org.name}</b>
            <span>{org.kind}</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
