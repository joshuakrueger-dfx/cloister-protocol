import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import { ApiProvider } from "./lib/ApiProvider";
import { SessionProvider } from "./lib/SessionProvider";
import { ConsoleLayout } from "./components/ConsoleLayout";
import { RequireAuth } from "./components/RequireAuth";
import { Onboarding } from "./screens/auth/Onboarding";
import { Overview } from "./screens/Overview";
import { Fund } from "./screens/Fund";
import { Disburse } from "./screens/Disburse";
import { Approvals } from "./screens/Approvals";
import { Recipients } from "./screens/Recipients";
import { Activity } from "./screens/Activity";
import { Compliance } from "./screens/Compliance";
import { Settings } from "./screens/Settings";

const router = createBrowserRouter([
  { path: "/welcome", element: <Onboarding /> },
  {
    path: "/",
    element: (
      <RequireAuth>
        <ConsoleLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="/overview" replace /> },
      { path: "overview", element: <Overview />, handle: { crumb: "CONSOLE", title: "Overview" } },
      { path: "fund", element: <Fund />, handle: { crumb: "OPERATE", title: "Fund" } },
      { path: "disburse", element: <Disburse />, handle: { crumb: "OPERATE", title: "Disburse" } },
      { path: "approvals", element: <Approvals />, handle: { crumb: "OPERATE", title: "Approvals" } },
      { path: "recipients", element: <Recipients />, handle: { crumb: "OPERATE", title: "Recipients" } },
      { path: "activity", element: <Activity />, handle: { crumb: "OPERATE", title: "Activity" } },
      {
        path: "compliance",
        element: <Compliance />,
        handle: { crumb: "COMPLIANCE", title: "Compliance Center" },
      },
      { path: "settings", element: <Settings />, handle: { crumb: "ACCOUNT", title: "Settings" } },
    ],
  },
  { path: "*", element: <Navigate to="/overview" replace /> },
], {
  // Served at "/" in dev, at "/app/" on the dev deploy — Vite sets BASE_URL,
  // react-router wants it without the trailing slash (root stays "/").
  basename: import.meta.env.BASE_URL.replace(/\/$/, "") || "/",
});

export function App() {
  return (
    <ApiProvider>
      <SessionProvider>
        <RouterProvider router={router} />
      </SessionProvider>
    </ApiProvider>
  );
}
