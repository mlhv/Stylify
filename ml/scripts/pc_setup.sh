#!/usr/bin/env bash
# Set up training on the gaming PC, inside WSL2 (Ubuntu). Run from ml/: scripts/pc_setup.sh <mac-user>@<mac-host>
# Checks the GPU, installs the ML project without ExecuTorch, and copies the training data from the Mac
# over SSH into ~/stylify-data on WSL's own disk. Safe to run again: rsync only copies what changed.
set -euo pipefail

MAC="${1:?usage: scripts/pc_setup.sh <mac-user>@<mac-host>}"
DATA="$HOME/stylify-data"
BASELINE="20261022-180946-efficientnet_b0"

case "$(pwd)" in
  /mnt/*) echo "Clone the repo onto WSL's own disk (e.g. ~/Stylify), not under /mnt: it is much faster." >&2; exit 1 ;;
esac
[ -f pyproject.toml ] && [ -d stylify_ml ] || { echo "Run this from the repo's ml/ folder." >&2; exit 1; }

echo "== GPU"
command -v nvidia-smi >/dev/null || { echo "nvidia-smi not found: update the Windows NVIDIA driver (WSL uses it)." >&2; exit 1; }
nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader

echo "== uv"
if ! command -v uv >/dev/null; then
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
fi
command -v rsync >/dev/null || { echo "Install rsync: sudo apt-get install -y rsync" >&2; exit 1; }

echo "== Python environment (no ExecuTorch)"
uv sync --no-group export
uv run --no-group export python - <<'EOF'
import torch
assert torch.cuda.is_available(), "CUDA is not available to PyTorch"
name = torch.cuda.get_device_name(0)
cap = torch.cuda.get_device_capability(0)
x = torch.randn(512, 512, device="cuda")
assert torch.isfinite(x @ x).all(), "a CUDA matmul gave non-finite values"
print(f"torch {torch.__version__}, CUDA {torch.version.cuda}, {name}, compute capability {cap[0]}.{cap[1]}: OK")
EOF

echo "== Data from $MAC"
mkdir -p "$DATA/runs/$BASELINE"
# One source per call: the Mac's rsync (openrsync) is the server, and single sources are the safest with it.
rsync -a --info=progress2 "$MAC:stylify-data/manifest.csv" "$DATA/"
rsync -a --info=progress2 "$MAC:stylify-data/crops" "$DATA/"
rsync -a --info=progress2 "$MAC:stylify-data/personal" "$DATA/"
rsync -a "$MAC:stylify-data/runs/$BASELINE/metrics.json" "$DATA/runs/$BASELINE/"

echo "== Counts (compare with the Mac)"
echo "manifest rows: $(($(wc -l < "$DATA/manifest.csv") - 1))"
echo "crop files:    $(find "$DATA/crops" -name '*.jpg' | wc -l)"
echo "personal:      $(find "$DATA/personal" -type f ! -name '.*' | wc -l)"
echo "Ready. Next: uv run --no-group export python -m stylify_ml.jobqueue --data ~/stylify-data --jobs sweeps/first.json --stop-at 21:30"
