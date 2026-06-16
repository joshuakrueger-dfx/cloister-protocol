import { useState } from "react";
import { useApi } from "../lib/ApiProvider";
import { useAsync } from "../lib/useAsync";
import { Button, Card, ScreenHead } from "../components/primitives";
import { ProofConsole } from "../components/ProofConsole";
import { toast, confirmDialog } from "../lib/overlays";
import { getApprovalThreshold } from "../lib/prefs";
import type { Approval, ProofStep } from "../lib/types";

export function Approvals() {
  const api = useApi();
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
      toast("Approved & sent privately", "success");
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Approval failed", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function reject(a: Approval) {
    const ok = await confirmDialog({
      title: "Reject this payment?",
      body: `${a.amount} · ${a.summary}. The payment won't be sent.`,
      confirmLabel: "Reject",
      danger: true,
    });
    if (!ok) return;
    setBusyId(a.id);
    try {
      await api.rejectDisbursement(a.id);
      toast("Payment rejected", "info");
      reload();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="view">
      <ScreenHead
        eyebrow="DUAL CONTROL"
        title="Approvals"
        sub={`Four-eyes control: payments at or above ${getApprovalThreshold().toLocaleString("en-US")} USDC wait here for a second authorised approver before they're sent. Smaller payments go through immediately.`}
      />
      <Card style={{ marginTop: 24 }}>
        <div className="clab">PENDING APPROVALS</div>
        {loading ? (
          <div className="note">Loading…</div>
        ) : error ? (
          <div className="note" style={{ color: "var(--bad)" }}>{error}</div>
        ) : items.length === 0 ? (
          <div className="note">Nothing waiting for approval right now.</div>
        ) : (
          <div style={{ marginTop: 12 }}>
            {items.map((a) => (
              <div className="approval-row" key={a.id}>
                <div className="approval-main">
                  <div className="approval-amt">{a.amount}</div>
                  <div className="approval-meta">
                    {a.kind === "batch" ? "Batch payout" : "Single payment"} · {a.summary}
                    {a.chain ? ` · ${a.chain}` : ""}
                  </div>
                </div>
                <div className="approval-actions">
                  <Button sm variant="solid" arrow onClick={() => approve(a)} disabled={busyId === a.id}>
                    {busyId === a.id ? "Sending…" : "Approve & send"}
                  </Button>
                  <Button sm onClick={() => reject(a)} disabled={busyId === a.id}>Reject</Button>
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
