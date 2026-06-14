import { Card, ComplianceList, ScreenHead } from "../components/primitives";

export function Settings() {
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
              { label: "Seed backup", value: "confirmed", level: "ok" },
              { label: "Viewing key", value: "read-only · shareable" },
              { label: "Note cache", value: "encrypted · local" },
            ]}
          />
        </Card>
        <Card>
          <div className="clab">INFRASTRUCTURE</div>
          <ComplianceList
            items={[
              { label: "Relayer", value: "DFX managed", level: "ok" },
              { label: "Indexer", value: "view-tags", level: "ok" },
              { label: "Registry", value: "3 chains" },
              { label: "Mode", value: "White-label ready" },
            ]}
          />
        </Card>
      </div>
    </section>
  );
}
