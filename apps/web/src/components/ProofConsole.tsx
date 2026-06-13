// Proof-Log-Console + Progress-Bar. Zeigt die ProofStep-Zeilen wie im
// Prototyp (inkl. Inline-Highlights). HTML stammt ausschließlich aus den
// Mock-Daten (kein User-Input) → dangerouslySetInnerHTML ist hier sicher.

import type { ProofStep } from "../lib/types";

export function ProofConsole({
  lines,
  idle,
  progress,
}: {
  lines: ProofStep[];
  idle: string;
  progress?: number;
}) {
  return (
    <>
      {progress !== undefined ? (
        <div className="progress">
          <i style={{ width: `${progress}%` }} />
        </div>
      ) : null}
      <div className="console">
        {lines.length === 0 ? (
          <span>{idle}</span>
        ) : (
          lines.map((l, i) => (
            <div key={i} dangerouslySetInnerHTML={{ __html: `cloister> ${l.html}` }} />
          ))
        )}
      </div>
    </>
  );
}
