// DFX fiat onramp (bank → USDC) for the Fund screen, with an automatic
// onramp→shield handoff: connect → buy → real SEPA instructions → poll the
// connected EVM address for the delivered USDC → one-click shield into the
// pool. Talks to the live api.dfx.swiss; the fiat transfer is out-of-band.

import { useEffect, useRef, useState } from "react";
import { useDfx } from "../lib/dfx/useDfx";
import type { BuyPaymentInfoDto } from "../lib/dfx";
import { DfxConnect } from "./DfxConnect";
import { Button, Field } from "./primitives";
import { useT } from "../lib/i18n";
import type { ChainId } from "../lib/types";

const CHAIN_LABEL: Record<ChainId, string> = { base: "Base", polygon: "Polygon", arbitrum: "Arbitrum" };
const SHORT = (a: string | null) => (a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a || "");
const POLL_MS = 15000;

export function DfxOnramp({ chain, onShield }: { chain: ChainId; onShield?: (amount: string) => void | Promise<void> }) {
  const dfx = useDfx();
  const tr = useT();
  const [amount, setAmount] = useState("100");
  const [currency, setCurrency] = useState("EUR");
  const [info, setInfo] = useState<BuyPaymentInfoDto | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [received, setReceived] = useState<number | null>(null);
  const [shielding, setShielding] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const verified = dfx.kyc?.status === "verified";
  const address = dfx.address;

  // Once a buy exists, poll the connected address for the delivered USDC.
  const waiting = !!info && !blocked && !!address;
  useEffect(() => {
    if (!waiting) return;
    let alive = true;
    const tick = async () => {
      const bal = await dfx.receivedUsdc(chain);
      if (alive) setReceived(bal);
    };
    void tick();
    pollRef.current = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [waiting, chain, dfx]);

  async function getPaymentInfo() {
    setBusy(true); setError(null); setBlocked(null); setInfo(null); setReceived(null);
    try {
      const res = await dfx.onramp({
        amount: Number(amount.replace(/[, ]/g, "")),
        currency,
        asset: "USDC",
        blockchain: CHAIN_LABEL[chain],
      });
      setInfo(res.info);
      setBlocked(res.blocked);
    } catch (e) {
      setError(e instanceof Error ? e.message : tr("Could not create the buy.", "Kauf konnte nicht erstellt werden."));
    } finally {
      setBusy(false);
    }
  }

  async function shieldReceived(value: number) {
    if (!onShield) return;
    setShielding(true);
    try {
      await onShield(String(Math.floor(value)));
    } finally {
      setShielding(false);
    }
  }

  // Not connected, or connected but KYC not yet verified → connect / KYC panel.
  if (!dfx.connected || !verified) {
    return (
      <div>
        <DfxConnect compact methods={["mail"]} />
        {dfx.connected && !verified ? (
          <div className="note">{tr("A buy needs a verified account. Complete KYC above, then return to onramp.", "Ein Kauf braucht ein verifiziertes Konto. Schließe oben das KYC ab und kehre zum Onramp zurück.")}</div>
        ) : null}
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div className="grid g2" style={{ marginTop: 0 }}>
        <Field label={tr("FIAT AMOUNT", "FIAT-BETRAG")} style={{ marginTop: 0 }}>
          <input className="input" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
        </Field>
        <Field label={tr("CURRENCY", "WÄHRUNG")} style={{ marginTop: 0 }}>
          <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option>EUR</option>
            <option>CHF</option>
          </select>
        </Field>
      </div>
      <div className="note" style={{ marginTop: 12 }}>
        {tr(
          `Buying USDC on ${CHAIN_LABEL[chain]} → delivered to your onramp address. It's then detected here and shielded into the pool in one click.`,
          `Kauf von USDC auf ${CHAIN_LABEL[chain]} → an deine Onramp-Adresse geliefert. Es wird dann hier erkannt und mit einem Klick in den Pool abgeschirmt.`,
        )}
      </div>
      <div className="actions">
        <Button variant="solid" arrow onClick={getPaymentInfo} disabled={busy}>
          {busy ? tr("Creating buy…", "Erstelle Kauf…") : tr("Get bank payment details", "Bank-Zahlungsdetails anzeigen")}
        </Button>
      </div>

      {error ? <div className="note" style={{ color: "var(--bad)" }}>{error}</div> : null}
      {blocked ? <div className="note" style={{ color: "var(--warn)" }}>{blocked}</div> : null}

      {info && !blocked ? (
        <>
          <div className="gatebox" style={{ marginTop: 14 }}>
            <div className="clab" style={{ marginBottom: 8 }}>{tr("TRANSFER THESE EXACT DETAILS (SEPA)", "GENAU DIESE DATEN ÜBERWEISEN (SEPA)")}</div>
            <div className="kv"><span className="k">{tr("Amount", "Betrag")}</span><span className="v">{info.amount} {info.currency.name}</span></div>
            <div className="kv"><span className="k">{tr("You receive (est.)", "Du erhältst (ca.)")}</span><span className="v">~{info.estimatedAmount} USDC</span></div>
            <div className="kv"><span className="k">IBAN</span><span className="v mono">{info.iban}</span></div>
            <div className="kv"><span className="k">BIC</span><span className="v mono">{info.bic}</span></div>
            <div className="kv"><span className="k">{tr("Recipient", "Empfänger")}</span><span className="v">{info.name}</span></div>
            <div className="kv"><span className="k">{tr("Reference", "Verwendungszweck")}</span><span className="v mono">{info.remittanceInfo}</span></div>
            <div className="note">
              {tr("Send the transfer from your own bank account.", "Sende die Überweisung von deinem eigenen Bankkonto.")} {info.sepaInstant ? tr("SEPA Instant supported.", "SEPA Instant unterstützt.") : ""}
            </div>
          </div>

          <div className="gatebox" style={{ marginTop: 12 }}>
            <div className="clab" style={{ marginBottom: 8 }}>ONRAMP → SHIELD</div>
            <div className="kv">
              <span className="k">{tr("USDC at", "USDC bei")} {SHORT(address)}</span>
              <span className="v">{received === null ? tr("checking…", "prüfe…") : `${received.toLocaleString("en-US")} USDC`}</span>
            </div>
            {received !== null && received > 0 ? (
              <div className="actions">
                <Button variant="solid" arrow onClick={() => shieldReceived(received)} disabled={shielding || !onShield}>
                  {shielding ? tr("Shielding…", "Schirme ab…") : tr(`Shield ${Math.floor(received).toLocaleString("en-US")} USDC into the pool`, `${Math.floor(received).toLocaleString("de-DE")} USDC in den Pool abschirmen`)}
                </Button>
              </div>
            ) : (
              <div className="note">
                {tr(`Waiting for the onramp to deliver USDC on ${CHAIN_LABEL[chain]} — this updates automatically every 15 s.`, `Warte darauf, dass der Onramp USDC auf ${CHAIN_LABEL[chain]} liefert — aktualisiert sich automatisch alle 15 s.`)} <button className="reveal-btn" onClick={() => dfx.receivedUsdc(chain).then(setReceived)}>{tr("check now", "jetzt prüfen")}</button>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
