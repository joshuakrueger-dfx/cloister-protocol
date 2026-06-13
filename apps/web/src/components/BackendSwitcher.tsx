import { useEffect, useRef, useState } from "react";
import { useBackend } from "../lib/ApiProvider";
import { backendsView } from "../lib/backends";

// Demo / Local / Base Sepolia Umschalter in der Topbar. Wechsel baut die aktive
// CloisterApi neu auf (Mock ↔ Real) und triggert einen Session-Refresh.
export function BackendSwitcher() {
  const { backendId, switchBackend } = useBackend();
  const backends = backendsView();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const active = backends.find((b) => b.id === backendId);

  function choose(id: string) {
    setBusy(true);
    try {
      switchBackend(id);
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="switcher" ref={ref}>
      <button
        className="chip btn-chip"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {active ? active.label : "Backend"} ▾
      </button>
      {open ? (
        <div className="switcher-menu" role="menu">
          {backends.map((b) => (
            <button
              key={b.id}
              className={`switcher-item${b.active ? " on" : ""}`}
              onClick={() => choose(b.id)}
              disabled={busy}
              role="menuitemradio"
              aria-checked={b.active}
            >
              <span className="d ok" style={{ opacity: b.active ? 1 : 0.18 }} />
              {b.label}
              <span className="meta">{b.meta}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
