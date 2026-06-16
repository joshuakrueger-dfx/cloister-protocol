import { useState } from "react";
import { useApi } from "../lib/ApiProvider";
import { useSession } from "../lib/SessionProvider";
import { Button, Card, Dots, Field, KeyValue, ScreenHead, Seg } from "../components/primitives";
import { Icon } from "../components/icons";
import { DfxOnramp } from "../components/DfxOnramp";
import { getActiveBackendId } from "../lib/backends";
import { CHAINS } from "../lib/types";
import type { Asset, ChainId } from "../lib/types";

const DFX_SOURCE = "Bank / card onramp (→ USDC)";
const FAUCET_SOURCE = "Devnet faucet (test USDC)";

export function Fund() {
  const api = useApi();
  const { session } = useSession();
  const backendId = getActiveBackendId();
  const isDemo = backendId === "demo";
  const [chain, setChain] = useState<ChainId>("base");
  const [amount, setAmount] = useState("1,000");
  const [asset] = useState<Asset>("USDC");
  const [source, setSource] = useState(DFX_SOURCE);
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
  const isDfxOnramp = source === DFX_SOURCE;

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
              <option>{DFX_SOURCE}</option>
              <option>{FAUCET_SOURCE}</option>
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
              <div className="clab" style={{ marginBottom: 4 }}>ONRAMP — BANK → USDC</div>
              <DfxOnramp chain={chain} onShield={shieldAmount} />
            </div>
          ) : (
            <>
              <div className="gatebox warn" style={{ marginTop: 18 }}>
                <div className="clab" style={{ marginBottom: 6 }}>DEVNET FAUCET — TEST USDC ONLY</div>
                <div className="gate-row">
                  <Icon name="shield" size={15} />
                  <span>
                    No real funds. The relayer <b>mints test USDC</b> on the {isDemo ? "demo" : "devnet"} pool
                    and shields it — so you can exercise the private-payout flow end to end.
                  </span>
                </div>
              </div>
              <Field label="AMOUNT (test USDC)">
                <input className="input" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
              </Field>
              {(() => {
                const verified = session?.kyc?.status === "verified";
                return (
                  <div className={`gatebox${verified ? "" : " warn"}`} style={{ marginTop: 14 }}>
                    <div className="clab" style={{ marginBottom: 8 }}>
                      {verified ? "COMPLIANCE SCREEN — PASSED (PoC)" : "COMPLIANCE — KYC REQUIRED"}
                    </div>
                    {verified ? (
                      <>
                        <div className="gate-row"><Icon name="check" size={15} /><span><b>Fields + jurisdiction</b> · embargo-checked at onboarding</span></div>
                        <div className="gate-row"><Icon name="check" size={15} /><span><b>Sanctions name screen</b> · PoC list (not the full OFAC/EU feed)</span></div>
                        <div className="gate-row"><Icon name="check" size={15} /><span><b>Association set</b> · deposit added to the ASP good-set when ASP enforcement is on</span></div>
                      </>
                    ) : (
                      <div className="gate-row"><Icon name="shield" size={15} /><span><b>KYC required</b> · complete identity screening before funding</span></div>
                    )}
                  </div>
                );
              })()}
              <div className="actions">
                <Button variant="solid" arrow onClick={onShield} disabled={busy}>
                  {busy ? "Minting & shielding" : `Mint & shield ${amount} test USDC`}
                  {busy ? <Dots /> : null}
                </Button>
              </div>
            </>
          )}

          {result ? (
            <div className="note" style={{ color: "var(--ok)" }}>
              ✓ Shielded {shieldedAmt ?? ""} — commitment {result} is in the pool. Open <b>Overview</b> to
              see the updated shielded balance.
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
              {isDfxOnramp ? "onramp" : "provider / relayer (gas sponsored)"}
            </KeyValue>
            <KeyValue k="Amount deposited" tone="pub">
              {isDfxOnramp ? "the onramp amount" : `${amount} test USDC`}
            </KeyValue>
            <KeyValue k="Commitment" tone="mono">
              {result ?? "—"}
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
