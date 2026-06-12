// HTTP-Client für die OpenCryptoPay "Shielded Methods"-Erweiterung (ARCHITECTURE §9).
// Treibt den Flow: Payment-Details → Tx-Details → (Proof bauen) → an Relayer einreichen.
export class OcpClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async _get(path) {
    const r = await fetch(`${this.baseUrl}${path}`);
    if (!r.ok) throw new Error(`GET ${path} → ${r.status}`);
    return r.json();
  }

  config() {
    return this._get("/config");
  }

  // Schritt 2: Payment-Details / Quote (mit shielded transferAmounts)
  paymentDetails(paymentId) {
    return this._get(`/v1/lnurlp/${paymentId}`);
  }

  // Schritt 3: Tx-Details (Pool-Instruktion: shieldedPool, recipientShieldAddress, …)
  txDetails(paymentId, quoteId, method, asset) {
    return this._get(`/v1/lnurlp/cb/${paymentId}?quote=${quoteId}&method=${method}&asset=${asset}`);
  }

  status(paymentId) {
    return this._get(`/v1/lnurlp/${paymentId}/status`);
  }

  // Schritt 5: abgeschirmte Tx beim Relayer einreichen
  async submit(body) {
    const r = await fetch(`${this.baseUrl}/v1/shielded/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(`submit → ${r.status}: ${data.error || ""}`);
    return data;
  }

  // optional (Demo): DFX-Settlement an den Händler auslösen
  async settle(paymentId) {
    const r = await fetch(`${this.baseUrl}/v1/settle`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paymentId }),
    });
    return r.json();
  }
}
