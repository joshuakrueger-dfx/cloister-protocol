import { useState } from "react";
import { useApi } from "../lib/ApiProvider";
import { useSession } from "../lib/SessionProvider";
import { Button, Card, Dots, Field, KeyValue, ScreenHead, Seg } from "../components/primitives";
import { DfxOnramp } from "../components/DfxOnramp";
import { KycVerify } from "../components/KycVerify";
import { getActiveBackendId } from "../lib/backends";
import { toast } from "../lib/overlays";
import { useT } from "../lib/i18n";
import { CHAINS } from "../lib/types";
import type { Asset, ChainId } from "../lib/types";

// Funding is only ever from a verified account: a DFX account (bank/card → USDC)
// or a connected wallet (USDC you already hold). No anonymous / faucet entry.
const DFX_SOURCE = "DFX account (bank / card → USDC)";
const WALLET_SOURCE = "Connected wallet (USDC you hold)";

export function Fund() {
  const api = useApi();
  const tr = useT();
  const { session } = useSession();
  const isDemo = getActiveBackendId() === "demo";
  const verified = session?.kyc?.status === "verified";

  const [chain, setChain] = useState<ChainId>("base");
  const [amount, setAmount] = useState("1,000");
  const [asset] = useState<Asset>("USDC");
  const [source, setSource] = useState(DFX_SOURCE);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shieldedAmt, setShieldedAmt] = useState<string | null>(null);

  const isDfxOnramp = source === DFX_SOURCE;

  async function shieldAmount(amt: string) {
    setBusy(true);
    setError(null);
    setResult(null);
    setShieldedAmt(null);
    try {
      const r = await api.shield({ amount: amt, asset, chain, source });
      setResult(r.commitment);
      setShieldedAmt(`${amt} ${asset}`);
      toast(tr(`Shielded ${amt} ${asset}`, `${amt} ${asset} abgeschirmt`), "success");
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("Shield failed.", "Abschirmen fehlgeschlagen."));
      toast(e instanceof Error ? e.message : tr("Shield failed", "Abschirmen fehlgeschlagen"), "error");
    } finally {
      setBusy(false);
    }
  }
  const onShield = () => shieldAmount(amount);

  return (
    <section className="view">
      <ScreenHead
        eyebrow={tr("PUBLIC TOUCHPOINT", "ÖFFENTLICHER BERÜHRUNGSPUNKT")}
        title={tr("Fund the shielded pool", "Den abgeschirmten Pool einzahlen")}
        sub={
          <>
            {tr(
              "This is the only public step. Funding is available after identity verification, and only from a DFX account or a connected wallet. After funding, every payout is private — the link to this deposit is cryptographically broken.",
              "Das ist der einzige öffentliche Schritt. Einzahlen ist nach der Identitätsprüfung möglich, und nur über ein DFX-Konto oder ein verbundenes Wallet. Nach der Einzahlung ist jede Auszahlung privat — die Verbindung zu dieser Einzahlung ist kryptografisch gebrochen.",
            )}
          </>
        }
      />

      {!verified ? (
        // ---- gate: must verify identity before any funding ----
        <div className="split" style={{ marginTop: 26 }}>
          <Card>
            <div className="clab">{tr("VERIFY IDENTITY TO FUND", "ZUM EINZAHLEN IDENTITÄT VERIFIZIEREN")}</div>
            <p className="sub" style={{ marginTop: 10 }}>
              {tr(
                "For compliance, funds can only enter the pool through a verified account. Connect an existing DFX account or a wallet — or create one — and complete verification to unlock funding. It only takes a few minutes.",
                "Aus Compliance-Gründen kann Geld nur über ein verifiziertes Konto in den Pool. Verbinde ein bestehendes DFX-Konto oder Wallet — oder lege eines an — und schließe die Verifizierung ab, um das Einzahlen freizuschalten. Dauert nur ein paar Minuten.",
              )}
            </p>
            <KycVerify />
          </Card>
          <PublicityCard amount={amount} isDfxOnramp={isDfxOnramp} result={null} />
        </div>
      ) : (
        <div className="split" style={{ marginTop: 26 }}>
          <Card>
            <div className="clab">{tr("FUND", "EINZAHLEN")}</div>
            <Field label={tr("SOURCE", "QUELLE")}>
              <select className="input" value={source} onChange={(e) => setSource(e.target.value)}>
                <option value={DFX_SOURCE}>{tr("DFX account (bank / card → USDC)", "DFX-Konto (Bank / Karte → USDC)")}</option>
                <option value={WALLET_SOURCE}>{tr("Connected wallet (USDC you hold)", "Verbundenes Wallet (USDC, das du hältst)")}</option>
              </select>
            </Field>
            <Field label="CHAIN">
              <Seg value={chain} onChange={setChain} options={CHAINS.map((c) => ({ value: c.id, label: c.label }))} />
            </Field>

            {isDfxOnramp ? (
              <div style={{ marginTop: 18 }}>
                <div className="clab" style={{ marginBottom: 4 }}>{tr("ONRAMP — BANK → USDC", "ONRAMP — BANK → USDC")}</div>
                <DfxOnramp chain={chain} onShield={shieldAmount} />
              </div>
            ) : (
              <>
                <Field label={tr(`AMOUNT (${asset})`, `BETRAG (${asset})`)}>
                  <input className="input" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
                </Field>
                <div className="note" style={{ marginTop: 4 }}>
                  {tr(
                    `Deposits ${asset} from your connected wallet into the pool and shields it.`,
                    `Zahlt ${asset} aus deinem verbundenen Wallet in den Pool ein und schirmt es ab.`,
                  )}
                  {isDemo ? tr(" In this demo, test USDC is used — no real funds move.", " In diesem Demo wird Test-USDC verwendet — es bewegt sich kein echtes Geld.") : ""}
                </div>
                <div className="actions">
                  <Button variant="solid" arrow onClick={onShield} disabled={busy || !amount.trim()}>
                    {busy ? tr("Depositing & shielding", "Einzahlen & abschirmen") : tr(`Deposit & shield ${amount} ${asset}`, `${amount} ${asset} einzahlen & abschirmen`)}
                    {busy ? <Dots /> : null}
                  </Button>
                </div>
              </>
            )}

            {result ? (
              <div className="note" style={{ color: "var(--ok)" }}>
                {tr(
                  `✓ Shielded ${shieldedAmt ?? ""} — commitment ${result} is in the pool. Open Overview to see the updated shielded balance.`,
                  `✓ ${shieldedAmt ?? ""} abgeschirmt — Commitment ${result} ist im Pool. Öffne die Übersicht für das aktualisierte abgeschirmte Guthaben.`,
                )}
              </div>
            ) : error ? (
              <div className="note" style={{ color: "var(--bad)" }}>{error}</div>
            ) : null}
          </Card>

          <PublicityCard amount={amount} isDfxOnramp={isDfxOnramp} result={result} />
        </div>
      )}
    </section>
  );
}

function PublicityCard({
  amount,
  isDfxOnramp,
  result,
}: {
  amount: string;
  isDfxOnramp: boolean;
  result: string | null;
}) {
  const tr = useT();
  return (
    <Card>
      <div className="clab">{tr("WHAT BECOMES PUBLIC", "WAS ÖFFENTLICH WIRD")}</div>
      <div style={{ marginTop: 14 }}>
        <KeyValue k={tr("Deposit tx (from)", "Einzahlungs-Tx (von)")} tone="pub">{isDfxOnramp ? tr("the onramp", "der Onramp") : tr("your connected wallet", "dein verbundenes Wallet")}</KeyValue>
        <KeyValue k={tr("Amount deposited", "Eingezahlter Betrag")} tone="pub">{isDfxOnramp ? tr("the onramp amount", "der Onramp-Betrag") : `${amount} USDC`}</KeyValue>
        <KeyValue k="Commitment" tone="mono">{result ?? "—"}</KeyValue>
      </div>
      <div className="clab" style={{ marginTop: 22 }}>{tr("WHAT STAYS PRIVATE", "WAS PRIVAT BLEIBT")}</div>
      <div style={{ marginTop: 14 }}>
        <KeyValue k={tr("Future recipients", "Künftige Empfänger")} tone="priv">{tr("hidden", "verborgen")}</KeyValue>
        <KeyValue k={tr("Payout amounts", "Auszahlungsbeträge")} tone="priv">{tr("hidden", "verborgen")}</KeyValue>
        <KeyValue k={tr("Link deposit ↔ payout", "Verbindung Einzahlung ↔ Auszahlung")} tone="priv">{tr("unlinkable", "nicht verknüpfbar")}</KeyValue>
        <KeyValue k={tr("Remaining balance", "Restguthaben")} tone="priv">{tr("hidden", "verborgen")}</KeyValue>
      </div>
    </Card>
  );
}
