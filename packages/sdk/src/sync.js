import { Note } from "./note.js";

// Sync über den Indexer: holt Commitments ab tree.leaves.length, baut den Tree und
// filtert pro Wallet via View-Tag, bevor voll entschlüsselt wird. Gibt Filter-Statistik
// zurück (zeigt den Discovery-Skalierungs-Vorteil).
export async function syncFromIndexer(indexerUrl, tree, wallets = [], options = {}) {
  const lane = Number(options.lane ?? 0);
  const levels = Number(options.levels ?? tree.levels ?? 20);
  if (!Number.isSafeInteger(lane) || lane < 0) throw new Error("invalid sync lane");
  if (!Number.isInteger(levels) || levels < 1 || levels > 31) throw new Error("invalid sync tree depth");
  const laneSpan = 2 ** levels;
  const url = `${indexerUrl.replace(/\/$/, "")}/commitments?from=${tree.leaves.length}&lane=${lane}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`indexer HTTP ${response.status}`);
  const body = await response.json();
  const { commitments } = body;
  if (!Array.isArray(commitments)) throw new Error("indexer returned invalid commitments");
  commitments.sort((a, b) => Number(a.localIndex ?? (Number(a.leafIndex) % laneSpan)) - Number(b.localIndex ?? (Number(b.leafIndex) % laneSpan)));

  const stats = { scanned: 0, tagMatched: 0, decrypted: 0 };
  for (const e of commitments) {
    const globalIdx = Number(e.leafIndex);
    const eventLane = Number(e.lane ?? Math.floor(globalIdx / laneSpan));
    const idx = Number(e.localIndex ?? (globalIdx % laneSpan));
    if (!Number.isSafeInteger(globalIdx) || eventLane !== lane || idx < 0 || idx >= laneSpan) {
      throw new Error(`indexer returned commitment from lane ${eventLane}, expected ${lane}`);
    }
    if (idx < tree.leaves.length) continue; // already synced
    // Contiguity guard: a gap (buggy/malicious indexer, or a scan that skipped earlier
    // commitments) would shift every later leaf's tree position and silently desync the
    // local root. Refuse instead of corrupting the tree — the caller's fallback picks another
    // source. Funds stay safe (commitment is recomputed + the on-chain root check backstops).
    if (idx !== tree.leaves.length)
      throw new Error(`leaf gap: expected index ${tree.leaves.length}, got ${idx}`);
    tree.insert(e.commitment);
    if (!e.encryptedOutput || e.encryptedOutput === "0x") continue;
    for (const w of wallets) {
      stats.scanned++;
      if (!Note.tagMatches(e.encryptedOutput, w.keypair.enc.secretKey)) continue; // View-Tag Fast-Reject
      stats.tagMatched++;
      if (await w.tryAdd(e.commitment, idx, e.encryptedOutput, lane)) stats.decrypted++;
    }
  }
  if (body.root != null && (await tree.root()) !== BigInt(body.root)) {
    throw new Error("indexer root mismatch: rebuilt lane tree differs from on-chain root");
  }
  return stats;
}

// Baut/aktualisiert einen Merkle-Tree (und optionale Wallets) inkrementell aus den
// NewCommitment-Events des Pools. Bewahrt spent-Flags (nur neue Leaves werden angewandt).
export async function syncFromChain(pool, tree, wallets = [], fromBlock = 0, options = {}) {
  const lane = Number(options.lane ?? 0);
  const levels = Number(options.levels ?? tree.levels ?? 20);
  if (!Number.isSafeInteger(lane) || lane < 0) throw new Error("invalid sync lane");
  if (!Number.isInteger(levels) || levels < 1 || levels > 31) throw new Error("invalid sync tree depth");
  const laneSpan = 2 ** levels;
  const logs = await pool.queryFilter(pool.filters.NewCommitment(), fromBlock);
  const events = logs
    .map((l) => ({ commitment: l.args[0], globalIndex: Number(l.args[1]), enc: l.args[2] }))
    .filter((e) => Math.floor(e.globalIndex / laneSpan) === lane)
    .map((e) => ({ ...e, leafIndex: e.globalIndex % laneSpan }))
    .sort((a, b) => a.leafIndex - b.leafIndex);

  let added = 0;
  for (const e of events) {
    if (e.leafIndex < tree.leaves.length) continue; // bereits synchronisiert
    // Contiguity guard (see syncFromIndexer): a gap would silently desync the tree.
    if (e.leafIndex !== tree.leaves.length)
      throw new Error(`leaf gap: expected index ${tree.leaves.length}, got ${e.leafIndex}`);
    tree.insert(e.commitment);
    for (const w of wallets) await w.tryAdd(e.commitment, e.leafIndex, e.enc, lane);
    added++;
  }
  return added;
}

// Resilienter Sync: bevorzugt den (schnellen, view-tag-gefilterten) Indexer; fällt bei
// Ausfall/Timeout auf einen direkten On-Chain-Scan zurück, damit Note-Discovery in JEDEM
// Netz funktioniert (VPN/Mobilfunk) und nie an einem toten Indexer hängen bleibt.
// `pool` (ethers.Contract) ist die Fallback-Quelle; `indexerUrls` werden der Reihe nach
// versucht. Wirft nur, wenn ALLE Quellen scheitern.
export async function syncWithFallback({ indexerUrls = [], pool, tree, wallets = [], fromBlock = 0, timeoutMs = 8000, lane = 0, levels = tree.levels ?? 20 }) {
  const withTimeout = (p, ms, label) => {
    let t;
    return Promise.race([
      p,
      new Promise((_, rej) => (t = setTimeout(() => rej(new Error(`timeout: ${label}`)), ms))),
    ]).finally(() => clearTimeout(t));
  };
  for (const url of indexerUrls) {
    try {
      const stats = await withTimeout(syncFromIndexer(url, tree, wallets, { lane, levels }), timeoutMs, `indexer ${url}`);
      return { via: `indexer:${url}`, ...stats };
    } catch {
      /* try next source */
    }
  }
  if (pool) {
    const added = await syncFromChain(pool, tree, wallets, fromBlock, { lane, levels });
    return { via: "chain-scan", added };
  }
  throw new Error("sync failed: no indexer reachable and no pool provided for chain-scan fallback");
}
