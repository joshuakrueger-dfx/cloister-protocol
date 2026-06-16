// Small client-side preferences (localStorage). Shared so Disburse and Settings
// agree on the same values.

const THRESHOLD_KEY = "cloister.approvalThreshold";
const DEFAULT_THRESHOLD = 10000;

export function getApprovalThreshold(): number {
  try {
    const v = Number(localStorage.getItem(THRESHOLD_KEY));
    return Number.isFinite(v) && v > 0 ? v : DEFAULT_THRESHOLD;
  } catch {
    return DEFAULT_THRESHOLD;
  }
}

export function setApprovalThreshold(n: number) {
  try {
    if (Number.isFinite(n) && n >= 0) localStorage.setItem(THRESHOLD_KEY, String(Math.round(n)));
  } catch {
    /* ignore */
  }
}

// Second tier: at/above this amount a payment needs TWO approvers, not one.
// 0 (or below tier-1) disables the second tier — one approver for everything ≥ tier-1.
const THRESHOLD2_KEY = "cloister.approvalThreshold2";
const DEFAULT_THRESHOLD2 = 50000;

export function getApprovalThreshold2(): number {
  try {
    const raw = localStorage.getItem(THRESHOLD2_KEY);
    if (raw === null) return DEFAULT_THRESHOLD2;
    const v = Number(raw);
    return Number.isFinite(v) && v >= 0 ? v : DEFAULT_THRESHOLD2;
  } catch {
    return DEFAULT_THRESHOLD2;
  }
}

export function setApprovalThreshold2(n: number) {
  try {
    if (Number.isFinite(n) && n >= 0) localStorage.setItem(THRESHOLD2_KEY, String(Math.round(n)));
  } catch {
    /* ignore */
  }
}

// How many approvers a payment of this amount needs: 0 (none), 1, or 2.
export function approvalsNeededFor(amount: number): number {
  if (!getRequireApproval()) return 0;
  const t1 = getApprovalThreshold();
  const t2 = getApprovalThreshold2();
  if (amount < t1) return 0;
  if (t2 > 0 && amount >= t2 && t2 >= t1) return 2;
  return 1;
}

// Whether dual approval (four-eyes) is enforced at all. When off, payments go
// straight through regardless of the threshold.
const REQUIRE_KEY = "cloister.requireApproval";

export function getRequireApproval(): boolean {
  try {
    return localStorage.getItem(REQUIRE_KEY) !== "0"; // default ON
  } catch {
    return true;
  }
}

export function setRequireApproval(on: boolean) {
  try {
    localStorage.setItem(REQUIRE_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}
