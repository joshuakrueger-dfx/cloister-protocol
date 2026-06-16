// PWA prompts: an in-app "Install app" button (driven by beforeinstallprompt)
// and an "update available" toast (driven by the service-worker registration).
// Rendered once at the app root. Pure overlay — no router/provider dependency.

import { useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { useT } from "../lib/i18n";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "cloister.pwa.installDismissed";

const wrap: React.CSSProperties = {
  position: "fixed",
  left: 0,
  right: 0,
  bottom: "calc(16px + env(safe-area-inset-bottom))",
  zIndex: 200,
  display: "flex",
  justifyContent: "center",
  padding: "0 16px",
  pointerEvents: "none",
};
const toast: React.CSSProperties = {
  pointerEvents: "auto",
  display: "flex",
  alignItems: "center",
  gap: 14,
  maxWidth: 460,
  width: "100%",
  padding: "12px 14px",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,.16)",
  background: "linear-gradient(150deg, rgba(22,24,28,.96), rgba(12,13,16,.97))",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  boxShadow: "0 16px 50px rgba(0,0,0,.55)",
  color: "#f4f5f7",
  font: "500 13px/1.4 'Helvetica Neue', -apple-system, Inter, Arial, sans-serif",
};
const solidBtn: React.CSSProperties = {
  flex: "0 0 auto",
  border: "none",
  borderRadius: 9,
  padding: "8px 14px",
  background: "#f4f5f7",
  color: "#08090b",
  fontWeight: 600,
  fontSize: 13,
  cursor: "pointer",
};
const ghostBtn: React.CSSProperties = {
  flex: "0 0 auto",
  border: "1px solid rgba(255,255,255,.16)",
  borderRadius: 9,
  padding: "8px 12px",
  background: "transparent",
  color: "rgba(244,245,247,.7)",
  fontSize: 13,
  cursor: "pointer",
};

export function PwaPrompts() {
  const tr = useT();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  const [installEvt, setInstallEvt] = useState<InstallPromptEvent | null>(null);
  const [installDismissed, setInstallDismissed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const onBIP = (e: Event) => {
      e.preventDefault();
      setInstallEvt(e as InstallPromptEvent);
    };
    const onInstalled = () => setInstallEvt(null);
    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const standalone =
    typeof window !== "undefined" &&
    (window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true);

  async function install() {
    if (!installEvt) return;
    await installEvt.prompt();
    try {
      await installEvt.userChoice;
    } catch {
      /* ignore */
    }
    setInstallEvt(null);
  }

  function dismissInstall() {
    setInstallDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  // Update takes priority over the install nudge.
  if (needRefresh) {
    return (
      <div style={wrap}>
        <div style={toast}>
          <span style={{ flex: 1 }}>{tr("A new version of the Console is available.", "Eine neue Version der Konsole ist verfügbar.")}</span>
          <button style={solidBtn} onClick={() => updateServiceWorker(true)}>
            {tr("Reload", "Neu laden")}
          </button>
          <button style={ghostBtn} onClick={() => setNeedRefresh(false)}>
            {tr("Later", "Später")}
          </button>
        </div>
      </div>
    );
  }

  if (installEvt && !installDismissed && !standalone) {
    return (
      <div style={wrap}>
        <div style={toast}>
          <span style={{ flex: 1 }}>{tr("Install the Cloister Console for one-tap access — works offline.", "Installiere die Cloister Console für Ein-Tipp-Zugriff — funktioniert offline.")}</span>
          <button style={solidBtn} onClick={install}>
            {tr("Install", "Installieren")}
          </button>
          <button style={ghostBtn} onClick={dismissInstall} aria-label="Dismiss">
            ✕
          </button>
        </div>
      </div>
    );
  }

  return null;
}
