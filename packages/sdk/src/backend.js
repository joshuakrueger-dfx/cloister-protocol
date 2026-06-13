// Pluggable crypto backend. The Cloister SDK no longer ships circomlib Poseidon or
// snarkjs; both hashing (Poseidon2) and proving (Groth16) are delegated to a backend:
//   • production (wallet):  the on-device native module (modules/cloister-prover)
//   • dev / CI / Node E2E:   the Go proverd HTTP service (cmd/proverd)
//
// This guarantees ONE hash + prover implementation (Go/gnark) across the circuit,
// the on-chain verifier and the client — no cross-language drift.

let _hash = null; // (items: bigint[]) => Promise<bigint>
let _prove = null; // (witnessInput: object) => Promise<{ a, b, c, publicSignals, proofHex }>

export function setHashBackend(fn) {
  _hash = fn;
}

export function setProveBackend(fn) {
  _prove = fn;
}

export function hasHashBackend() {
  return _hash != null;
}

export async function backendHash(items) {
  if (!_hash) {
    throw new Error(
      "cloister: no hash backend configured — call setHashBackend() (native module or proverd) first",
    );
  }
  return _hash(items.map((x) => BigInt(x)));
}

export async function backendProve(witnessInput) {
  if (!_prove) {
    throw new Error("cloister: no prove backend configured — call setProveBackend() first");
  }
  return _prove(witnessInput);
}

// Convenience: wire both backends to a running proverd (Node/dev). In React Native
// the wallet wires the native module instead (see useCloisterProver).
export function useHttpBackend(baseUrl, fetchImpl = globalThis.fetch) {
  const base = baseUrl.replace(/\/$/, "");
  setHashBackend(async (items) => {
    const res = await fetchImpl(`${base}/hash`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(items.map((x) => x.toString())),
    });
    if (!res.ok) throw new Error(`proverd /hash HTTP ${res.status}`);
    const { hash } = await res.json();
    return BigInt(hash);
  });
  setProveBackend(async (witnessInput) => {
    const res = await fetchImpl(`${base}/prove`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(witnessInput),
    });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        detail = (await res.json()).error || detail;
      } catch {
        /* ignore */
      }
      throw new Error(`proverd /prove: ${detail}`);
    }
    return res.json();
  });
}
