// Cloister anonymity-set simulation (fills STRESS_TEST §0.4 — cold-start risk).
//
// Privacy in a shielded pool is NOT given by the ZK proof — it is given by the crowd a
// withdrawal can hide in. This simulation models the dominant real-world leak for an
// arbitrary-amount payment pool: AMOUNT MATCHING. An adversary sees public deposit and
// withdraw amounts; a withdrawal hides only among movements it is plausibly confusable
// with. We measure the anonymity set per withdrawal under three amount strategies and a
// range of activity levels, to answer: "what volume + amount policy makes privacy real?"
//
// Model (deliberately simple + stated, indicative not a proof):
//   - `users` participants are active in a rolling window (the live crowd).
//   - Each deposits a payment-sized amount, then later withdraws it.
//   - Adversary links a withdrawal to deposits sharing a confusable amount that are live
//     in the same window. Anonymity set = size of that confusable, live crowd.
//   Strategies:
//     EXACT       — invoice amounts (2-decimal, realistic spread) → mostly unique → linkable
//     DENOMINATED — snap to a small set of round denominations → crowds form
//     SPLIT       — every amount expressed as standard denominations (Tornado-style) → max crowd
//
// Usage: node sim/anonymity-set.mjs
'use strict';

let seed = 0x9e3779b9;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

const DENOMS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000]; // "standard" units

function paymentAmount() {
  // realistic-ish payment: log-spread 1..2000 with cents
  const base = Math.exp(rnd() * Math.log(2000));
  return Math.round(base * 100) / 100;
}
function snapDenom(a) {
  let best = DENOMS[0];
  for (const d of DENOMS) if (Math.abs(d - a) < Math.abs(best - a)) best = d;
  return best;
}
function splitDenoms(a) {
  // greedy decomposition into DENOMS (integer part) → list of denomination "notes"
  let r = Math.max(1, Math.round(a));
  const out = [];
  for (let i = DENOMS.length - 1; i >= 0; i--) {
    while (r >= DENOMS[i]) { out.push(DENOMS[i]); r -= DENOMS[i]; }
  }
  return out.length ? out : [1];
}

// For a given strategy + live crowd size, produce the public "movement keys" each
// withdrawal is confusable with, and compute anonymity-set sizes.
function simulate(strategy, users, rounds = 40) {
  // each round: `users` live participants each move money; collect movement keys
  const setSizes = [];
  for (let r = 0; r < rounds; r++) {
    const keys = []; // confusable units moving in this window
    for (let u = 0; u < users; u++) {
      const a = paymentAmount();
      if (strategy === 'EXACT') keys.push(a.toFixed(2));
      else if (strategy === 'DENOMINATED') keys.push(String(snapDenom(a)));
      else for (const d of splitDenoms(a)) keys.push(String(d)); // SPLIT: many unit-notes
    }
    // anonymity set of a movement = how many movements share its key (incl. itself)
    const counts = {};
    for (const k of keys) counts[k] = (counts[k] || 0) + 1;
    for (const k of keys) setSizes.push(counts[k]);
  }
  setSizes.sort((a, b) => a - b);
  const median = setSizes[Math.floor(setSizes.length / 2)];
  const uniquePct = (100 * setSizes.filter((s) => s === 1).length) / setSizes.length;
  const lt5Pct = (100 * setSizes.filter((s) => s < 5).length) / setSizes.length;
  const mean = setSizes.reduce((a, b) => a + b, 0) / setSizes.length;
  return { median, mean: +mean.toFixed(1), uniquePct: +uniquePct.toFixed(1), lt5Pct: +lt5Pct.toFixed(1) };
}

console.log('Cloister anonymity-set simulation (amount-matching adversary)\n');
console.log('strategy      users  medianSet  meanSet  %uniquelyLinkable  %set<5');
const userLevels = [10, 50, 200, 1000, 5000];
const strategies = ['EXACT', 'DENOMINATED', 'SPLIT'];
const results = {};
for (const st of strategies) {
  for (const u of userLevels) {
    seed = 0x9e3779b9 + u; // vary per level, reproducible
    const r = simulate(st, u);
    results[`${st}@${u}`] = r;
    console.log(
      `${st.padEnd(12)} ${String(u).padStart(5)}  ${String(r.median).padStart(8)}  ${String(r.mean).padStart(7)}  ${String(r.uniquePct).padStart(16)}%  ${String(r.lt5Pct).padStart(5)}%`,
    );
  }
  console.log('');
}

// Verdict: a "real privacy" bar = ≥90% of withdrawals have anonymity set ≥10 (≤10% with set<5
// is a softer proxy we print). Find the minimum users per strategy where uniquely-linkable ≈0.
function minUsersFor(strategy, maxUniquePct = 1) {
  for (const u of [10, 50, 200, 1000, 5000]) {
    seed = 0x9e3779b9 + u;
    if (simulate(strategy, u).uniquePct <= maxUniquePct) return u;
  }
  return '>5000';
}
console.log('Minimum live crowd for ~0% uniquely-linkable withdrawals:');
for (const st of strategies) console.log(`  ${st.padEnd(12)} → ${minUsersFor(st)} concurrent active users`);
console.log('\nTakeaway: with EXACT (invoice) amounts, even thousands of users leave many');
console.log('withdrawals uniquely linkable — amount IS the deanonymizer. DENOMINATED/SPLIT');
console.log('amount policies are REQUIRED for the ZK privacy to matter, plus a real crowd.');
