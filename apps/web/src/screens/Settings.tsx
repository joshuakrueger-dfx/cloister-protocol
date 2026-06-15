import { Card, ComplianceList, ScreenHead } from "../components/primitives";
import { useSession } from "../lib/SessionProvider";
import { getActiveBackendId, getBackendConfig } from "../lib/backends";

export function Settings() {
  const { session } = useSession();
  const backend = getBackendConfig(getActiveBackendId());
  const dfxLinked = session?.dfxLinked ?? false;

  return (
    <section className="view">
      <ScreenHead
        eyebrow="ACCOUNT"
        title="Settings"
        sub="Self-custody. Your spend / view / nullifier keys derive from one seed and never leave the device. Notes are recoverable from chain history via the viewing key."
      />
      <div className="grid g2" style={{ marginTop: 24 }}>
        <Card>
          <div className="clab">KEYS & RECOVERY</div>
          <ComplianceList
            items={[
              { label: "Seed phrase", value: "self-custody · BIP39", level: "ok" },
              { label: "Viewing key", value: "read-only · shareable" },
              { label: "Note cache", value: "encrypted · local" },
              { label: "Vault", value: "password-encrypted on this device", level: "ok" },
            ]}
          />
        </Card>
        <Card>
          <div className="clab">INFRASTRUCTURE</div>
          <ComplianceList
            items={[
              { label: "Backend", value: `${backend.label} · ${backend.meta}`, level: "ok" },
              { label: "Relayer", value: "broadcast-only (gas sponsored)", level: "ok" },
              { label: "Indexer", value: "view-tags" },
              { label: "DFX account", value: dfxLinked ? "linked" : "not linked", level: dfxLinked ? "ok" : "pending" },
            ]}
          />
        </Card>
      </div>
    </section>
  );
}
