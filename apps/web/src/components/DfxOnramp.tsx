// DFX fiat onramp (bank → USDC) for the Fund screen. Connect → buy → real
// SEPA payment instructions. The bought USDC is delivered to the connected
// EVM address; the actual transfer happens out-of-band, after which the user
// shields it into the pool. Talks to the live api.dfx.swiss.

import { useState } from "react";
import { useDfx } from "../lib/dfx/useDfx";
import type { BuyPaymentInfoDto } from "../lib/dfx";
import { DfxConnect } from "./DfxConnect";
import { Button, Field } from "./primitives";
import type { ChainId } from "../lib/types";

const CHAIN_LABEL: Record<ChainId, string> = { base: "Base", polygon: "Polygon", arbitrum: "Arbitrum" };

export function DfxOnramp({ chain }: { chain: ChainId }) {
  const dfx = useDfx();
  const [amount, setAmount] = useState("100");
  const [currency, setCurrency] = useState("EUR");
  const [info, setInfo] = useState<BuyPaymentInfoDto | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verified = dfx.kyc?.status === "verified";

  async function getPaymentInfo() {
    setBusy(true); setError(null); setBlocked(null); setInfo(null);
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
      setError(e instanceof Error ? e.message : "Could not create the buy.");
    } finally {
      setBusy(false);
    }
  }

  // Not connected, or connected but KYC not yet verified → show the connect /
  // KYC panel (a buy needs an authenticated, KYC'd DFX account).
  if (!dfx.connected || !verified) {
    return (
      <div>
        <DfxConnect compact />
        {dfx.connected && !verified ? (
          <div className="note">A DFX buy needs a verified account. Complete KYC above, then return to onramp.</div>
        ) : null}
      </div>
    );
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div className="grid g2" style={{ marginTop: 0 }}>
        <Field label="FIAT AMOUNT" style={{ marginTop: 0 }}>
          <input className="input" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
        </Field>
        <Field label="CURRENCY" style={{ marginTop: 0 }}>
          <select className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option>EUR</option>
            <option>CHF</option>
          </select>
        </Field>
      </div>
      <div className="note" style={{ marginTop: 12 }}>
        Buying <b>USDC on {CHAIN_LABEL[chain]}</b> → delivered to your DFX address. After it arrives,
        shield it into the pool below.
      </div>
      <div className="actions">
        <Button variant="solid" arrow onClick={getPaymentInfo} disabled={busy}>
          {busy ? "Creating buy…" : "Get bank payment details"}
        </Button>
      </div>

      {error ? <div className="note" style={{ color: "var(--bad)" }}>{error}</div> : null}
      {blocked ? <div className="note" style={{ color: "var(--warn)" }}>{blocked}</div> : null}

      {info && !blocked ? (
        <div className="gatebox" style={{ marginTop: 14 }}>
          <div className="clab" style={{ marginBottom: 8 }}>TRANSFER THESE EXACT DETAILS (SEPA)</div>
          <div className="kv"><span className="k">Amount</span><span className="v">{info.amount} {info.currency.name}</span></div>
          <div className="kv"><span className="k">You receive (est.)</span><span className="v">~{info.estimatedAmount} USDC</span></div>
          <div className="kv"><span className="k">IBAN</span><span className="v mono">{info.iban}</span></div>
          <div className="kv"><span className="k">BIC</span><span className="v mono">{info.bic}</span></div>
          <div className="kv"><span className="k">Recipient</span><span className="v">{info.name}</span></div>
          <div className="kv"><span className="k">Reference</span><span className="v mono">{info.remittanceInfo}</span></div>
          <div className="note">
            Send the transfer from your own bank account. DFX screens it, then delivers USDC to your
            address — return here to shield it. {info.sepaInstant ? "SEPA Instant supported." : ""}
          </div>
        </div>
      ) : null}
    </div>
  );
}
