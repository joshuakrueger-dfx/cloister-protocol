import { useState } from "react";
import { useApi } from "../lib/ApiProvider";
import { useAsync } from "../lib/useAsync";
import { Button, Card, ScreenHead } from "../components/primitives";
import { ProofConsole } from "../components/ProofConsole";
import { toast, confirmDialog } from "../lib/overlays";
import { getApprovalThreshold } from "../lib/prefs";
import { useT } from "../lib/i18n";
import type { Approval, ProofStep } from "../lib/types";

export function Approvals() {
  const api = useApi();
  const tr = useT();
  const { data, loading, error, reload } = useAsync<Approval[]>(() => api.getApprovals(), []);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [lines, setLines] = useState<ProofStep[]>([]);
  const [progress, setProgress] = useState<number | undefined>(undefined);
  const items = data ?? [];

  async function approve(a: Approval) {
    setBusyId(a.id);
    setLines([]);
    setProgress(0);
    try {
      await api.approveDisbursement(a.id, (s) => {
        setProgress(s.progress);
        setLines((p) => [...p, s]);
      });
      toast(tr("Approved & sent privately", "Freigegeben & privat gesendet"), "success");
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : tr("Approval failed", "Freigabe fehlgeschlagen"), "error");
    } finally {
      setBusyId(null);
    }
  }

  async function reject(a: Approval) {
    const ok = await confirmDialog({
      title: tr("Reject this payment?", "Diese Zahlung ablehnen?"),
      body: tr(`${a.amount} · ${a.summary}. The payment won't be sent.`, `${a.amount} · ${a.summary}. Die Zahlung wird nicht gesendet.`),
      confirmLabel: tr("Reject", "Ablehnen"),
      danger: true,
    });
    if (!ok) return;
    setBusyId(a.id);
    try {
      await api.rejectDisbursement(a.id);
      toast(tr("Payment rejected", "Zahlung abgelehnt"), "info");
      reload();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="view">
      <ScreenHead
        eyebrow={tr("DUAL CONTROL", "VIER-AUGEN-PRINZIP")}
        title={tr("Approvals", "Freigaben")}
        sub={tr(
          `Four-eyes control: payments at or above ${getApprovalThreshold().toLocaleString("en-US")} USDC wait here for a second authorised approver before they're sent. Smaller payments go through immediately.`,
          `Vier-Augen-Prinzip: Zahlungen ab ${getApprovalThreshold().toLocaleString("de-DE")} USDC warten hier auf einen zweiten berechtigten Freigeber, bevor sie gesendet werden. Kleinere Zahlungen gehen sofort durch.`,
        )}
      />
      <Card style={{ marginTop: 24 }}>
        <div className="clab">{tr("PENDING APPROVALS", "OFFENE FREIGABEN")}</div>
        {loading ? (
          <div className="note">{tr("Loading…", "Lädt…")}</div>
        ) : error ? (
          <div className="note" style={{ color: "var(--bad)" }}>{error}</div>
        ) : items.length === 0 ? (
          <div className="note">{tr("Nothing waiting for approval right now.", "Aktuell wartet nichts auf Freigabe.")}</div>
        ) : (
          <div style={{ marginTop: 12 }}>
            {items.map((a) => (
              <div className="approval-row" key={a.id}>
                <div className="approval-main">
                  <div className="approval-amt">{a.amount}</div>
                  <div className="approval-meta">
                    {a.kind === "batch" ? tr("Batch payout", "Sammelauszahlung") : tr("Single payment", "Einzelzahlung")} · {a.summary}
                    {a.chain ? ` · ${a.chain}` : ""}
                  </div>
                </div>
                <div className="approval-actions">
                  <Button sm variant="solid" arrow onClick={() => approve(a)} disabled={busyId === a.id}>
                    {busyId === a.id ? tr("Sending…", "Sende…") : tr("Approve & send", "Freigeben & senden")}
                  </Button>
                  <Button sm onClick={() => reject(a)} disabled={busyId === a.id}>{tr("Reject", "Ablehnen")}</Button>
                </div>
              </div>
            ))}
          </div>
        )}
        {lines.length ? <ProofConsole lines={lines} progress={progress} idle="" /> : null}
      </Card>
    </section>
  );
}
