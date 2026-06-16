import { useState } from "react";
import { Outlet, useLocation, useMatches } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { useT } from "../lib/i18n";

// crumb + Titel pro Route via Router-handle.
interface RouteHandle {
  crumb?: string;
  title?: string;
}

const CRUMB_DE: Record<string, string> = { CONSOLE: "KONSOLE", OPERATE: "BETRIEB", COMPLIANCE: "COMPLIANCE", ACCOUNT: "KONTO" };
const TITLE_DE: Record<string, string> = {
  Overview: "Übersicht", Fund: "Einzahlen", Disburse: "Auszahlen", Approvals: "Freigaben",
  Recipients: "Empfänger", Activity: "Aktivität", "Compliance Center": "Compliance-Center", Settings: "Einstellungen",
};

export function ConsoleLayout() {
  const [navOpen, setNavOpen] = useState(false);
  const matches = useMatches();
  const location = useLocation();
  const tr = useT();
  const handle = (matches[matches.length - 1]?.handle as RouteHandle | undefined) ?? {};
  const crumb = handle.crumb ?? "CONSOLE";
  const title = handle.title ?? "Overview";

  return (
    <div className="app">
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      {navOpen ? <div className="scrim" onClick={() => setNavOpen(false)} /> : null}
      <main className="console-main">
        <Topbar
          crumb={tr(crumb, CRUMB_DE[crumb] ?? crumb)}
          title={tr(title, TITLE_DE[title] ?? title)}
          onMenu={() => setNavOpen(true)}
        />
        {/* key auf location → fade-Animation der .view bei jedem Routenwechsel */}
        <div key={location.pathname}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
