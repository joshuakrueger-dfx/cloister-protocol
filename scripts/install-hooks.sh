#!/usr/bin/env bash
# Copyright (c) 2026 DFX AG. Licensed under the MIT License (see LICENSE).
# Point git at the repo's tracked hooks (.githooks/) so the fast pre-push quality gate runs.
# One-time, per clone. Undo with: git config --unset core.hooksPath
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
git config core.hooksPath .githooks
chmod +x .githooks/* 2>/dev/null || true
echo "Installed: core.hooksPath → .githooks (pre-push fast gate active)."
echo "Bypass a single push with: git push --no-verify"
