import { useState } from "react";
import { useApi } from "../lib/ApiProvider";
import { Button, Card, Field, KeyValue, ScreenHead, Seg } from "../components/primitives";
import { Icon } from "../components/icons";
import { CHAINS } from "../lib/types";
import type { Asset, ChainId } from "../lib/types";

export function Fund() {
  const api = useApi();
  const [chain, setChain] = useState<ChainId>("base");
  const [amount, setAmount] = useState("50,000");
  const [asset, setAsset] = useState<Asset>("USDC");
  const [source, setSource] = useState("DFX Onramp (bank / card → USDC)");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onShield() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await api.shield({ amount, asset, chain, source });
      setResult(r.commitment);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Shield failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="view">
      <ScreenHead
        eyebrow="PUBLIC TOUCHPOINT"
        title="Fund the shielded pool."
        sub={
          <>
            This is the <b>only</b> public step. KYC, sanctions screening and geofencing run here.
            After funding, every payout is private — the link to this deposit is cryptographically
            broken.
          </>
        }
      />

      <div className="split" style={{ marginTop: 26 }}>
        <Card>
          <div className="clab">FUND</div>
          <Field label="SOURCE">
            <select className="input" value={source} onChange={(e) => setSource(e.target.value)}>
              <option>DFX Onramp (bank / card → USDC)</option>
              <option>Connected wallet (public address)</option>
              <option>Existing treasury address</option>
            </select>
          </Field>
          <div className="grid g2" style={{ marginTop: 0 }}>
            <Field label="AMOUNT">
              <input className="input" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field label="ASSET">
              <select
                className="input"
                value={asset}
                onChange={(e) => setAsset(e.target.value as Asset)}
              >
                <option>USDC</option>
                <option>EURC</option>
                <option>USDT</option>
              </select>
            </Field>
          </div>
          <Field label="CHAIN">
            <Seg
              value={chain}
              onChange={setChain}
              options={CHAINS.map((c) => ({ value: c.id, label: c.label }))}
            />
          </Field>

          <div className="gatebox">
            <div className="clab" style={{ marginBottom: 8 }}>
              COMPLIANCE GATE — CLEARED
            </div>
            {[
              ["Identity", "Nimbus DAO entity KYB verified (2026-04)"],
              ["Sanctions", "source address clears OFAC + EU lists"],
              ["Jurisdiction", "CH/EU/US permitted for this entity"],
              ["Association set", "deposit will be added to ASP good-set"],
            ].map(([b, rest]) => (
              <div className="gate-row" key={b}>
                <Icon name="check" size={15} />
                <span>
                  <b>{b}</b> · {rest}
                </span>
              </div>
            ))}
          </div>
          <div className="actions">
            <Button variant="solid" arrow onClick={onShield} disabled={busy}>
              {busy ? "Shielding…" : `Shield ${amount} ${asset}`}
            </Button>
          </div>
          {result ? (
            <div className="note" style={{ color: "var(--ok)" }}>
              Shielded. Deposit commitment {result} entered the canonical pool + ASP association
              root.
            </div>
          ) : error ? (
            <div className="note" style={{ color: "var(--bad)" }}>
              {error}
            </div>
          ) : (
            <div className="note">
              The deposit commitment enters the canonical pool and the ASP association root. No
              payout can be traced back to it — but you can always prove it was clean.
            </div>
          )}
        </Card>

        <Card>
          <div className="clab">WHAT BECOMES PUBLIC</div>
          <div style={{ marginTop: 14 }}>
            <KeyValue k="Deposit tx (from)" tone="pub">
              Nimbus public addr
            </KeyValue>
            <KeyValue k="Amount shielded" tone="pub">
              {amount} {asset}
            </KeyValue>
            <KeyValue k="Commitment" tone="mono">
              {result ?? "0x9f…c41a"}
            </KeyValue>
          </div>
          <div className="clab" style={{ marginTop: 22 }}>
            WHAT STAYS PRIVATE
          </div>
          <div style={{ marginTop: 14 }}>
            <KeyValue k="Future recipients" tone="priv">
              hidden
            </KeyValue>
            <KeyValue k="Payout amounts" tone="priv">
              hidden
            </KeyValue>
            <KeyValue k="Link deposit ↔ payout" tone="priv">
              unlinkable
            </KeyValue>
            <KeyValue k="Remaining balance" tone="priv">
              hidden
            </KeyValue>
          </div>
        </Card>
      </div>
    </section>
  );
}
