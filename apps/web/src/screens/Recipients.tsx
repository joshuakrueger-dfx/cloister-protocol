import { useApi } from "../lib/ApiProvider";
import { useAsync } from "../lib/useAsync";
import { Card, ScreenHead, Tag } from "../components/primitives";

export function Recipients() {
  const api = useApi();
  const { data, loading, error } = useAsync(() => api.getRecipients(), []);

  return (
    <section className="view">
      <ScreenHead
        eyebrow="COUNTERPARTIES"
        title="Recipients."
        sub="Labels are encrypted with your viewing key and live only in your account. On-chain, the counterparty never appears."
      />
      <Card style={{ marginTop: 24, padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Label (encrypted)</th>
              <th>Type</th>
              <th>Address</th>
              <th>Last paid</th>
              <th>Sanctions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr className="loading-row">
                <td colSpan={5}>Loading…</td>
              </tr>
            ) : error ? (
              <tr className="error-row">
                <td colSpan={5}>{error}</td>
              </tr>
            ) : (data?.length ?? 0) === 0 ? (
              <tr className="loading-row">
                <td colSpan={5}>No recipients yet.</td>
              </tr>
            ) : (
              data!.map((r) => (
                <tr key={r.id}>
                  <td className="addr">{r.label}</td>
                  <td>{r.type}</td>
                  <td className="mono">{r.address}</td>
                  <td>{r.lastPaid}</td>
                  <td>
                    <Tag level={r.sanctions}>clear</Tag>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </section>
  );
}
