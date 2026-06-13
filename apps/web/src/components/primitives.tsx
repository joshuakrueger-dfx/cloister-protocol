// Wiederverwendbare UI-Primitives — Styles aus prototype.reference.html.
// Bewusst dünn gehalten; die meiste Optik kommt aus app.css-Klassen.

import type { ReactNode, ButtonHTMLAttributes } from "react";
import type { StatusLevel } from "../lib/types";

// ---------- Card ----------
export function Card({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={`card ${className}`} style={style}>
      {children}
    </div>
  );
}

export function CardLabel({ children }: { children: ReactNode }) {
  return <div className="clab">{children}</div>;
}

// ---------- StatCard ----------
export function StatCard({
  label,
  value,
  foot,
  unit,
}: {
  label: ReactNode;
  value: ReactNode;
  foot?: ReactNode;
  unit?: string;
}) {
  return (
    <Card>
      <div className="clab">{label}</div>
      <div className="big">
        {value}
        {unit ? <span style={{ fontSize: 18, color: "var(--dim)" }}> {unit}</span> : null}
      </div>
      {foot ? <div className="cfoot">{foot}</div> : null}
    </Card>
  );
}

// ---------- Button ----------
type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "solid" | "ghost";
  sm?: boolean;
  arrow?: boolean;
};
export function Button({
  variant = "ghost",
  sm = false,
  arrow = false,
  children,
  className = "",
  ...rest
}: BtnProps) {
  const cls = [
    "btn",
    variant === "solid" ? "btn-solid" : "",
    sm ? "btn-sm" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button className={cls} {...rest}>
      {children}
      {arrow ? <span className="arr">→</span> : null}
    </button>
  );
}

// ---------- Status dot + tags ----------
export function Dot({ level }: { level: StatusLevel }) {
  return <span className={`d ${level === "ok" ? "ok" : level === "pending" ? "warn" : "bad"}`} />;
}

export function Tag({ level, children }: { level: StatusLevel; children: ReactNode }) {
  const cls = level === "ok" ? "tag-ok" : level === "pending" ? "tag-pend" : "tag-bad";
  return (
    <span className={cls}>
      <Dot level={level} />
      {children}
    </span>
  );
}

// ---------- KeyValue ----------
export function KeyValue({
  k,
  children,
  tone = "default",
}: {
  k: ReactNode;
  children: ReactNode;
  tone?: "default" | "pub" | "priv" | "mono";
}) {
  const vClass =
    tone === "pub" ? "v pub" : tone === "priv" ? "v priv" : tone === "mono" ? "v mono" : "v";
  return (
    <div className="kv">
      <span className="k">{k}</span>
      <span className={vClass}>{children}</span>
    </div>
  );
}

// ---------- Compliance list ----------
export function ComplianceList({
  items,
}: {
  items: { label: ReactNode; value: ReactNode; level?: StatusLevel }[];
}) {
  return (
    <div className="clist">
      {items.map((it, i) => (
        <div className="ci" key={i}>
          <span className="t">{it.label}</span>
          <span className="s">
            {it.level ? <Dot level={it.level} /> : null}
            {it.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ---------- Meter ----------
export function Meter({
  rows,
}: {
  rows: { chain: string; fill: number; display: string }[];
}) {
  return (
    <div className="meter">
      {rows.map((r, i) => (
        <div className="row" key={i}>
          <span className="chain">{r.chain}</span>
          <div className="bar">
            <i style={{ width: `${Math.round(r.fill * 100)}%` }} />
          </div>
          <span className="n">{r.display}</span>
        </div>
      ))}
    </div>
  );
}

// ---------- Segmented control ----------
export function Seg<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button
          key={o.value}
          className={o.value === value ? "on" : ""}
          onClick={() => onChange(o.value)}
          type="button"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------- Field / Input / Select ----------
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}

// ---------- Eyebrow + heading ----------
export function ScreenHead({
  eyebrow,
  title,
  sub,
}: {
  eyebrow: string;
  title: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <>
      <div className="eyebrow">
        <span className="sq" />
        {eyebrow}
      </div>
      <div className="h2">{title}</div>
      {sub ? <p className="sub">{sub}</p> : null}
    </>
  );
}

// ---------- States ----------
export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function CenterState({
  children,
  tone = "faint",
}: {
  children: ReactNode;
  tone?: "faint" | "bad";
}) {
  return (
    <div className="center-state" style={tone === "bad" ? { color: "var(--bad)" } : undefined}>
      {children}
    </div>
  );
}
