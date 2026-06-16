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
    "contexts": ["Go prover + circuit (race)", "Solidity contracts (Hardhat)", "SDK cross-language KAT (JS)", "Slither static analysis"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON

echo "Protected $REPO@main — PRs must pass: prover (race+soundness), contracts, sdk KAT, slither."
echo "(enforce_admins=false: you keep a direct-push escape hatch; the pre-push hook gates those.)"
