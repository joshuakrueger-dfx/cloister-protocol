import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../lib/ApiProvider";
import { useAsync } from "../lib/useAsync";
import {
  Button,
  Card,
  CardLabel,
  ComplianceList,
  Meter,
  ScreenHead,
} from "../components/primitives";
import { CHAINS } from "../lib/types";
import { DisbursementTable } from "../components/DisbursementTable";

export function Overview() {
  const api = useApi();
  const nav = useNavigate();
  const [revealed, setRevealed] = useState(false);

  const balance = useAsync(() => api.getBalance(), []);
  const anon = useAsync(() => api.getAnonymitySet(), []);
  const comp = useAsync(() => api.getComplianceStatus(), []);
  const recent = useAsync(() => api.getRecentDisbursements(), []);

  const chainLabel = (id: string) => CHAINS.find((c) => c.id === id)?.label ?? id;

  return (
    <section className="view">
      <ScreenHead
        eyebrow="TREASURY"
        title="Good morning, Nimbus."
        sub="Your shielded treasury is healthy and compliant. Disburse privately — every payment carries a proof of clean origin, and nothing links a payout to your wallet on-chain."
      />

      <div className="grid g3" style={{ marginTop: 28 }}>
        <Card>
          <div className="clab">
            SHIELDED BALANCE
            <button className="reveal-btn" onClick={() => setRevealed((r) => !r)}>
              {revealed ? "hide" : "reveal"}
            </button>
          </div>
          <div className="big">
            {balance.loading ? (
              <span className="skeleton" style={{ width: 140 }} />
            ) : balance.error ? (
              <span style={{ color: "var(--bad)", fontSize: 16 }}>{balance.error}</span>
            ) : (
              <>
                <span className={`privacy-val${revealed ? "" : " masked"}`}>
                  {balance.data?.total.toLocaleString("en-US")}
                </span>{" "}
                <span style={{ fontSize: 18, color: "var(--dim)" }}>{balance.data?.asset}</span>
              </>
            )}
          </div>
          <div className="cfoot">
            {balance.data
              ? `across ${balance.data.chains} chains · ${balance.data.notes} notes`
              : "—"}
          </div>
        </Card>

        <Card>
          <div className="clab">
            ANONYMITY SET <span className="chip">{anon.data?.health ?? "—"}</span>
          </div>
          {anon.loading ? (
            <div className="meter">
              {[0, 1, 2].map((i) => (
                <div className="row" key={i}>
                  <span className="skeleton" style={{ width: 200 }} />
                </div>
              ))}
            </div>
          ) : anon.error ? (
            <div className="cfoot" style={{ color: "var(--bad)" }}>
              {anon.error}
            </div>
          ) : (
            <Meter
              rows={(anon.data?.buckets ?? []).map((b) => ({
                chain: chainLabel(b.chain),
                fill: b.fill,
                display: b.display,
              }))}
            />
          )}
        </Card>

        <Card>
          <div className="clab">COMPLIANCE STATUS</div>
          {comp.loading ? (
            <div className="clist">
              {[0, 1, 2, 3].map((i) => (
                <div className="ci" key={i}>
                  <span className="skeleton" style={{ width: 180 }} />
                </div>
              ))}
            </div>
          ) : comp.error ? (
            <div className="cfoot" style={{ color: "var(--bad)" }}>
              {comp.error}
            </div>
          ) : (
            <ComplianceList
              items={(comp.data?.items ?? []).map((it) => ({
                label: it.label,
                value: it.value,
                level: it.level,
              }))}
            />
          )}
        </Card>
      </div>

      <div className="actions" style={{ marginTop: 24 }}>
        <Button variant="solid" arrow onClick={() => nav("/disburse")}>
          Disburse
        </Button>
        <Button arrow onClick={() => nav("/fund")}>
          Fund treasury
        </Button>
        <Button arrow onClick={() => nav("/compliance")}>
          Export compliance receipt
        </Button>
      </div>

      <Card className="" style={{ marginTop: 28, padding: 0 }}>
        <div
          style={{
            padding: "20px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <CardLabel>RECENT DISBURSEMENTS</CardLabel>
          <button className="reveal-btn" onClick={() => nav("/activity")}>
            view all
          </button>
        </div>
        <DisbursementTable
          rows={recent.data ?? []}
          loading={recent.loading}
          error={recent.error}
        />
      </Card>
    </section>
  );
}
