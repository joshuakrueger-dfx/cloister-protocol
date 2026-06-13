import { useNavigate } from "react-router-dom";
import { useApi } from "../lib/ApiProvider";
import { useAsync } from "../lib/useAsync";
import { Button, Card, ScreenHead } from "../components/primitives";
import { DisbursementTable } from "../components/DisbursementTable";

export function Activity() {
  const api = useApi();
  const nav = useNavigate();
  const { data, loading, error } = useAsync(() => api.getActivity(), []);

  return (
    <section className="view">
      <ScreenHead
        eyebrow="YOUR LEDGER"
        title="Activity."
        sub="Decrypted with your viewing key — visible only to you. Read-only. Export for accounting or selective disclosure."
      />
      <div className="actions" style={{ marginTop: 18 }}>
        <Button sm>Filter</Button>
        <Button sm>Export CSV</Button>
        <Button sm onClick={() => nav("/compliance")}>
          Generate receipt
        </Button>
      </div>
      <Card style={{ marginTop: 20, padding: 0 }}>
        <DisbursementTable rows={data ?? []} withDate loading={loading} error={error} />
      </Card>
    </section>
  );
}
