import { useState } from "react";
import { useApi } from "../lib/ApiProvider";
import { useSession } from "../lib/SessionProvider";
import { Button, Card, Dots, Field, KeyValue, ScreenHead, Seg } from "../components/primitives";
import { Icon } from "../components/icons";
import { DfxOnramp } from "../components/DfxOnramp";
import { CHAINS } from "../lib/types";
import type { Asset, ChainId } from "../lib/types";

export function Fund() {
  const api = useApi();
  const { session } = useSession();
  const [chain, setChain] = useState<ChainId>("base");
  const [amount, setAmount] = useState("50,000");
  const [asset, setAsset] = useState<Asset>("USDC");
  const [source, setSource] = useState("DFX Onramp (bank / card → USDC)");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [shieldedAmt, setShieldedAmt] = useState<string | null>(null);
  async function shieldAmount(amt: string) {
    setBusy(true);
    setError(null);
    setResult(null);
    setShieldedAmt(null);
    try {
      const r = await api.shield({ amount: amt, asset, chain, source });
      setResult(r.commitment);
      setShieldedAmt(`${amt} ${asset}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Shield failed.");
    } finally {
      setBusy(false);
    }
  }
  const onShield = () => shieldAmount(amount);
  const isDfxOnramp = source.startsWith("DFX Onramp");

  return (
    <section className="view">
      <ScreenHead
        eyebrow="PUBLIC TOUCHPOINT"
        title="Fund the shielded pool"
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
          <Field label="CHAIN">
            <Seg
              value={chain}
              onChange={setChain}
              options={CHAINS.map((c) => ({ value: c.id, label: c.label }))}
            />
          </Field>

          {isDfxOnramp ? (
            // DFX onramp: you shield exactly what the buy delivers on-chain — no
            // free-form amount, so you can never "shield" funds you don't hold.
            <div style={{ marginTop: 18 }}>
              <div className="clab" style={{ marginBottom: 4 }}>DFX ONRAMP — BANK → USDC</div>
              <DfxOnramp chain={chain} onShield={shieldAmount} />
            </div>
          ) : (
            <>
              <div className="grid g2" style={{ marginTop: 18 }}>
                <Field label="AMOUNT" style={{ marginTop: 0 }}>
                  <input className="input" value={amount} onChange={(e) => setAmount(e.target.value)} />
                </Field>
                <Field label="ASSET" style={{ marginTop: 0 }}>
                  <select className="input" value={asset} onChange={(e) => setAsset(e.target.value as Asset)}>
                    <option>USDC</option>
                    <option>EURC</option>
                    <option>USDT</option>
                  </select>
                </Field>
              </div>

              {(() => {
                const kyc = session?.kyc;
                const verified = kyc?.status === "verified";
                const who = session?.org.name || "this account";
                const subj = kyc?.subjectType === "entity" ? "entity" : "individual";
                const jx = kyc?.jurisdiction;
                const rows: Array<[string, string]> = verified
                  ? [
                      ["Identity", `${who} (${subj}) KYC-verified at level ${kyc?.level ?? "L3"}`],
                      ["Sanctions", "screened against OFAC SDN + EU consolidated list"],
                      ["Jurisdiction", `${jx ?? "—"} profile · permitted`],
                      ["Association set", "deposit will be added to the ASP good-set"],
                    ]
                  : [["KYC required", "complete identity verification before funding"]];
                return (
                  <div className={`gatebox${verified ? "" : " warn"}`}>
                    <div className="clab" style={{ marginBottom: 8 }}>
                      {verified ? "COMPLIANCE GATE — CLEARED" : "COMPLIANCE GATE — ACTION REQUIRED"}
                    </div>
                    {rows.map(([b, rest]) => (
                      <div className="gate-row" key={b}>
                        <Icon name={verified ? "check" : "shield"} size={15} />
                        <span>
                          <b>{b}</b> · {rest}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })()}
              <div className="actions">
                <Button variant="solid" arrow onClick={onShield} disabled={busy}>
                  {busy ? "Shielding" : `Shield ${amount} ${asset}`}
                  {busy ? <Dots /> : null}
                </Button>
              </div>
              <div className="note">
                Shields USDC you already hold at this address. The deposit commitment enters the pool
                and the ASP good-set — no payout can be traced back to it.
              </div>
            </>
          )}

          {result ? (
            <div className="note" style={{ color: "var(--ok)" }}>
              ✓ Shielded {shieldedAmt ?? ""} — your shielded balance updated (see Overview). Deposit
              commitment {result} entered the canonical pool + ASP association root.
            </div>
          ) : error ? (
            <div className="note" style={{ color: "var(--bad)" }}>
              {error}
            </div>
          ) : null}
        </Card>

        <Card>
          <div className="clab">WHAT BECOMES PUBLIC</div>
          <div style={{ marginTop: 14 }}>
            <KeyValue k="Deposit tx (from)" tone="pub">
              {source.startsWith("DFX") ? "DFX onramp" : "your public address"}
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
