import { Note } from "./note.js";

// Sync über den Indexer: holt Commitments ab tree.leaves.length, baut den Tree und
// filtert pro Wallet via View-Tag, bevor voll entschlüsselt wird. Gibt Filter-Statistik
// zurück (zeigt den Discovery-Skalierungs-Vorteil).
export async function syncFromIndexer(indexerUrl, tree, wallets = []) {
  const url = `${indexerUrl.replace(/\/$/, "")}/commitments?from=${tree.leaves.length}`;
  const { commitments } = await (await fetch(url)).json();
  commitments.sort((a, b) => a.leafIndex - b.leafIndex);

  const stats = { scanned: 0, tagMatched: 0, decrypted: 0 };
  for (const e of commitments) {
    if (e.leafIndex < tree.leaves.length) continue;
    tree.insert(e.commitment);
    if (!e.encryptedOutput || e.encryptedOutput === "0x") continue;
    for (const w of wallets) {
      stats.scanned++;
      if (!Note.tagMatches(e.encryptedOutput, w.keypair.enc.secretKey)) continue; // View-Tag Fast-Reject
      stats.tagMatched++;
      if (await w.tryAdd(e.commitment, e.leafIndex, e.encryptedOutput)) stats.decrypted++;
    }
  }
  return stats;
}

// Baut/aktualisiert einen Merkle-Tree (und optionale Wallets) inkrementell aus den
// NewCommitment-Events des Pools. Bewahrt spent-Flags (nur neue Leaves werden angewandt).
export async function syncFromChain(pool, tree, wallets = [], fromBlock = 0) {
  const logs = await pool.queryFilter(pool.filters.NewCommitment(), fromBlock);
  const events = logs
    .map((l) => ({ commitment: l.args[0], leafIndex: Number(l.args[1]), enc: l.args[2] }))
    .sort((a, b) => a.leafIndex - b.leafIndex);

  let added = 0;
  for (const e of events) {
    if (e.leafIndex < tree.leaves.length) continue; // bereits synchronisiert
    tree.insert(e.commitment);
    for (const w of wallets) await w.tryAdd(e.commitment, e.leafIndex, e.enc);
    added++;
  }
  return added;
}
