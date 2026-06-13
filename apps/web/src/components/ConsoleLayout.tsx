import { useState } from "react";
import { Outlet, useLocation, useMatches } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

// crumb + Titel pro Route via Router-handle.
interface RouteHandle {
  crumb?: string;
  title?: string;
}

export function ConsoleLayout() {
  const [navOpen, setNavOpen] = useState(false);
  const matches = useMatches();
  const location = useLocation();
  const handle = (matches[matches.length - 1]?.handle as RouteHandle | undefined) ?? {};

  return (
    <div className="app">
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />
      {navOpen ? <div className="scrim" onClick={() => setNavOpen(false)} /> : null}
      <main className="console-main">
        <Topbar
          crumb={handle.crumb ?? "CONSOLE"}
          title={handle.title ?? "Overview"}
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
