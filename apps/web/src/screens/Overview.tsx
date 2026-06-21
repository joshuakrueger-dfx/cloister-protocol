import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApi } from "../lib/ApiProvider";
import { useSession } from "../lib/SessionProvider";
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
import { KycVerify } from "../components/KycVerify";
import { fundingRequiresKyc } from "../lib/backends";
import { useT } from "../lib/i18n";

export function Overview() {
  const api = useApi();
  const nav = useNavigate();
  const tr = useT();
  const { session } = useSession();
  const [revealed, setRevealed] = useState(() => {
    try { return localStorage.getItem("cloister.showBalances") === "1"; } catch { return false; }
  });
  const [verifyOpen, setVerifyOpen] = useState(false);
  const orgName = session?.org.name && session.org.name !== "Your Treasury" ? session.org.name.split(" ")[0] : "there";
  // Only real backends gate funding on verification; Demo has no gate, so no prompt.
  const needsKyc = fundingRequiresKyc() && !!session && session.kyc.status !== "verified";

  const balance = useAsync(() => api.getBalance(), []);
  const anon = useAsync(() => api.getAnonymitySet(), []);
  const comp = useAsync(() => api.getComplianceStatus(), []);
  const recent = useAsync(() => api.getRecentDisbursements(), []);

  const chainLabel = (id: string) => CHAINS.find((c) => c.id === id)?.label ?? id;

  return (
    <section className="view">
      <ScreenHead
        eyebrow="TREASURY"
        title={tr(`Good morning, ${orgName}`, `Guten Morgen, ${orgName}`)}
        sub={tr(
          "Your shielded treasury is healthy and compliant. Disburse privately — every payment carries a proof of clean origin, and nothing links a payout to your wallet on-chain.",
          "Dein abgeschirmtes Treasury ist gesund und compliant. Zahle privat aus — jede Zahlung trägt einen Beweis sauberer Herkunft, und nichts verknüpft eine Auszahlung on-chain mit deiner Wallet.",
        )}
      />

      {needsKyc ? (
        <Card style={{ marginTop: 20 }}>
          <div className="clab">{tr("IDENTITY — ACTION NEEDED", "IDENTITÄT — AKTION ERFORDERLICH")}</div>
          <p className="sub" style={{ marginTop: 10 }}>
            {tr(
              "Your account is ready. To unlock funding and private payouts, verify your identity once with a regulated account — connect an existing one or create a new one. It only takes a few minutes.",
              "Dein Konto ist bereit. Um Einzahlung und private Auszahlungen freizuschalten, verifiziere einmalig deine Identität mit einem regulierten Konto — ein bestehendes verbinden oder ein neues anlegen. Dauert nur ein paar Minuten.",
            )}
          </p>
          {verifyOpen ? (
            <KycVerify onDone={() => setVerifyOpen(false)} />
          ) : (
            <div className="actions">
              <Button variant="solid" arrow onClick={() => setVerifyOpen(true)}>
                {tr("Verify identity", "Identität verifizieren")}
              </Button>
            </div>
          )}
        </Card>
      ) : null}

      <div className="grid g3" style={{ marginTop: 28 }}>
        <Card>
          <div className="clab">
            {tr("SHIELDED BALANCE", "ABGESCHIRMTES GUTHABEN")}
            <button className="reveal-btn" onClick={() => setRevealed((r) => !r)}>
              {revealed ? tr("hide", "verbergen") : tr("reveal", "zeigen")}
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
              ? tr(
                  `across ${balance.data.chains} ${balance.data.chains === 1 ? "chain" : "chains"} · ${balance.data.notes} ${balance.data.notes === 1 ? "note" : "notes"}`,
                  `auf ${balance.data.chains} ${balance.data.chains === 1 ? "Chain" : "Chains"} · ${balance.data.notes} Notes`,
                )
              : "—"}
          </div>
        </Card>

        <Card>
          <div className="clab">
            {tr("ANONYMITY SET", "ANONYMITÄTS-SET")} <span className="chip">{anon.data?.health ?? "—"}</span>
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
          <div className="clab">{tr("COMPLIANCE STATUS", "COMPLIANCE-STATUS")}</div>
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
          {tr("Disburse", "Auszahlen")}
        </Button>
        <Button arrow onClick={() => nav("/fund")}>
          {tr("Fund treasury", "Treasury einzahlen")}
        </Button>
        <Button arrow onClick={() => nav("/compliance")}>
          {tr("Export compliance receipt", "Compliance-Beleg exportieren")}
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
          <CardLabel>{tr("RECENT DISBURSEMENTS", "LETZTE AUSZAHLUNGEN")}</CardLabel>
          <button className="reveal-btn" onClick={() => nav("/activity")}>
            {tr("view all", "alle ansehen")}
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
