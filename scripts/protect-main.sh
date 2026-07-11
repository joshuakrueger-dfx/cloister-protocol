#!/usr/bin/env bash
# Copyright (c) 2026 DFX AG. Licensed under the MIT License (see LICENSE).
#
# Enable branch protection on main: no PR may merge unless the blocking CI gates are green.
# REQUIRES a public repo or GitHub Pro (GitHub blocks branch protection on free private repos)
# AND admin on the repo. Run once after making the repo public / upgrading.
#
#   scripts/protect-main.sh [owner/repo]   (default: joshuakrueger-dfx/cloister-protocol)
set -euo pipefail
REPO="${1:-joshuakrueger-dfx/cloister-protocol}"

gh api -X PUT "repos/$REPO/branches/main/protection" --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["Go prover + circuit (race)", "MPC ceremony roundtrip", "Solidity contracts (Hardhat)", "SDK cross-language KAT (JS)", "SDK ↔ proverd end-to-end (native crypto)", "Web production build + source hygiene", "Slither static analysis"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": true,
    "required_approving_review_count": 2,
    "require_last_push_approval": true
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON

echo "Protected $REPO@main — two reviews plus prover, ceremony, e2e, web, contracts, SDK and Slither gates."
