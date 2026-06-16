import { useState } from "react";
import { useApi } from "../lib/ApiProvider";
import { useSession } from "../lib/SessionProvider";
import { Button, Card, Dots, Field, KeyValue, ScreenHead, Seg } from "../components/primitives";
import { DfxOnramp } from "../components/DfxOnramp";
import { KycVerify } from "../components/KycVerify";
import { getActiveBackendId } from "../lib/backends";
import { toast } from "../lib/overlays";
import { CHAINS } from "../lib/types";
import type { Asset, ChainId } from "../lib/types";

// Funding is only ever from a verified account: a DFX account (bank/card → USDC)
// or a connected wallet (USDC you already hold). No anonymous / faucet entry.
const DFX_SOURCE = "DFX account (bank / card → USDC)";
const WALLET_SOURCE = "Connected wallet (USDC you hold)";

export function Fund() {
  const api = useApi();
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
      toast(`Shielded ${amt} ${asset}`, "success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Shield failed.");
      toast(e instanceof Error ? e.message : "Shield failed", "error");
    } finally {
      setBusy(false);
    }
  }
  const onShield = () => shieldAmount(amount);

  return (
    <section className="view">
      <ScreenHead
        eyebrow="PUBLIC TOUCHPOINT"
        title="Fund the shielded pool"
        sub={
          <>
            This is the <b>only</b> public step. Funding is available after identity verification, and
            only from a <b>DFX account</b> or a <b>connected wallet</b>. After funding, every payout is
            private — the link to this deposit is cryptographically broken.
          </>
        }
      />

      {!verified ? (
        // ---- gate: must verify identity before any funding ----
        <div className="split" style={{ marginTop: 26 }}>
          <Card>
            <div className="clab">VERIFY IDENTITY TO FUND</div>
            <p className="sub" style={{ marginTop: 10 }}>
              For compliance, funds can only enter the pool through a verified account. Connect an
              existing DFX account or a wallet — or create one — and complete verification to unlock
              funding. It only takes a few minutes.
            </p>
            <KycVerify />
          </Card>
          <PublicityCard amount={amount} isDfxOnramp={isDfxOnramp} result={null} />
        </div>
      ) : (
        <div className="split" style={{ marginTop: 26 }}>
          <Card>
            <div className="clab">FUND</div>
            <Field label="SOURCE">
              <select className="input" value={source} onChange={(e) => setSource(e.target.value)}>
                <option>{DFX_SOURCE}</option>
                <option>{WALLET_SOURCE}</option>
              </select>
            </Field>
            <Field label="CHAIN">
              <Seg value={chain} onChange={setChain} options={CHAINS.map((c) => ({ value: c.id, label: c.label }))} />
            </Field>

            {isDfxOnramp ? (
              <div style={{ marginTop: 18 }}>
                <div className="clab" style={{ marginBottom: 4 }}>ONRAMP — BANK → USDC</div>
                <DfxOnramp chain={chain} onShield={shieldAmount} />
              </div>
            ) : (
              <>
                <Field label={`AMOUNT (${asset})`}>
                  <input className="input" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
                </Field>
                <div className="note" style={{ marginTop: 4 }}>
                  Deposits {asset} from your connected wallet into the pool and shields it.
                  {isDemo ? " In this demo, test USDC is used — no real funds move." : ""}
                </div>
                <div className="actions">
                  <Button variant="solid" arrow onClick={onShield} disabled={busy || !amount.trim()}>
                    {busy ? "Depositing & shielding" : `Deposit & shield ${amount} ${asset}`}
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
  return (
    <Card>
      <div className="clab">WHAT BECOMES PUBLIC</div>
      <div style={{ marginTop: 14 }}>
        <KeyValue k="Deposit tx (from)" tone="pub">{isDfxOnramp ? "the onramp" : "your connected wallet"}</KeyValue>
        <KeyValue k="Amount deposited" tone="pub">{isDfxOnramp ? "the onramp amount" : `${amount} USDC`}</KeyValue>
        <KeyValue k="Commitment" tone="mono">{result ?? "—"}</KeyValue>
      </div>
      <div className="clab" style={{ marginTop: 22 }}>WHAT STAYS PRIVATE</div>
      <div style={{ marginTop: 14 }}>
        <KeyValue k="Future recipients" tone="priv">hidden</KeyValue>
        <KeyValue k="Payout amounts" tone="priv">hidden</KeyValue>
        <KeyValue k="Link deposit ↔ payout" tone="priv">unlinkable</KeyValue>
        <KeyValue k="Remaining balance" tone="priv">hidden</KeyValue>
      </div>
    </Card>
  );
}
