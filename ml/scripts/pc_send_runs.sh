#!/usr/bin/env bash
# Copy finished runs from the gaming PC (WSL) back to the Mac. Usage: scripts/pc_send_runs.sh <mac-user>@<mac-host>
# Runs only: never the crops, manifest or personal photos. Half-written runs in runs/_failed/ stay on the PC.
# --update keeps the Mac's newer files (it caches .pte sizes into metrics.json, and may re-evaluate runs);
# the baseline run is the Mac's own and is never sent back.
set -euo pipefail

MAC="${1:?usage: scripts/pc_send_runs.sh <mac-user>@<mac-host>}"
rsync -a --update --info=progress2 --exclude _failed --exclude 20261022-180946-efficientnet_b0 \
  "$HOME/stylify-data/runs/" "$MAC:stylify-data/runs/"
rsync -a "$HOME/stylify-data/logs/" "$MAC:stylify-data/logs-pc/" 2>/dev/null || true
echo "Sent. On the Mac: uv run python -m stylify_ml.evaluate --data ~/stylify-data --compare --baseline 20261022-180946-efficientnet_b0"
