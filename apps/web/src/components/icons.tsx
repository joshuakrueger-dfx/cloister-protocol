// Monochrome Icon-Set — 1:1 aus prototype.reference.html / website portiert.
// currentColor wird respektiert, damit Nav-Hover-Farben greifen.

export type IconName =
  | "grid"
  | "shield"
  | "send"
  | "users"
  | "list"
  | "doc"
  | "cog"
  | "check";

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const common = {
    viewBox: "0 0 24 24",
    width: size,
    height: size,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
  } as const;
  switch (name) {
    case "grid":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      );
    case "shield":
      return (
        <svg {...common}>
          <path d="M12 3l7 3v5c0 4.4-3 8-7 10-4-2-7-5.6-7-10V6z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      );
    case "send":
      return (
        <svg {...common}>
          <path d="M4 12l16-7-7 16-2-7z" />
        </svg>
      );
    case "users":
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" />
          <path d="M16 5.5a3 3 0 0 1 0 6M21 20c0-2.8-1.6-4.7-4-5.3" />
        </svg>
      );
    case "list":
      return (
        <svg {...common}>
          <path d="M8 6h12M8 12h12M8 18h12" />
          <circle cx="4" cy="6" r="1" />
          <circle cx="4" cy="12" r="1" />
          <circle cx="4" cy="18" r="1" />
        </svg>
      );
    case "doc":
      return (
        <svg {...common}>
          <path d="M7 3h7l4 4v14H7z" />
          <path d="M14 3v4h4" />
          <path d="M9.5 13h5M9.5 16h5" />
        </svg>
      );
    case "cog":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
        </svg>
      );
    case "check":
      return (
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#7ee0a8" strokeWidth={1.8}>
          <circle cx="12" cy="12" r="9" />
          <path d="M8 12l3 3 5-6" />
        </svg>
      );
  }
}

// Wortmarke wie im Prototyp (logo-slot).
export function Logo() {
  return (
    <svg width="50" height="14" viewBox="0 0 120 32" fill="none" aria-label="Cloister">
      <circle cx="13" cy="16" r="9" fill="#f4f5f7" />
      <rect x="27" y="14.4" width="16" height="3.2" rx="1.6" fill="#f4f5f7" />
      <circle cx="60" cy="16" r="8.5" stroke="#f4f5f7" strokeWidth="3" />
      <rect x="77" y="14.4" width="16" height="3.2" rx="1.6" fill="#f4f5f7" />
      <circle cx="107" cy="16" r="9" fill="#f4f5f7" />
    </svg>
  );
}
