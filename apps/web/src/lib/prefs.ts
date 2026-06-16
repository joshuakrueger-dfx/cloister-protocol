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
