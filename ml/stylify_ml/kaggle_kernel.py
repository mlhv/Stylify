"""Runs on Kaggle, not locally: train and evaluate each model in job.json on the GPU.

Uses only the standard library, so it can find and unpack the code before importing it. Reads the
private datasets that `stylify_ml.bundle` staged, works in /tmp (so the 1.7 GB of crops are not saved
as kernel output), and writes one folder per run to /kaggle/working/runs/.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path


def _find(root: Path, name: str, want_dir: bool) -> Path | None:
    hits = sorted(p for p in root.rglob(name) if p.is_dir() == want_dir)
    return min(hits, key=lambda p: len(p.parts)) if hits else None


def _descend(path: Path) -> Path:
    """Kaggle may unpack `x.zip` into `x/x/`; step into a lone child with the same name."""
    while True:
        children = list(path.iterdir())
        if len(children) == 1 and children[0].is_dir() and children[0].name == path.name:
            path = children[0]
        else:
            return path


def locate(inputs: Path, name: str, tmp: Path) -> Path:
    """The folder `name` from the inputs: as Kaggle unpacked it, or extracted from `name.zip` into tmp."""
    found = _find(inputs, name, want_dir=True)
    if found is not None:
        return _descend(found)
    archive = _find(inputs, f"{name}.zip", want_dir=False)
    if archive is None:
        raise FileNotFoundError(f"neither {name}/ nor {name}.zip is under {inputs}")
    with zipfile.ZipFile(archive) as z:
        z.extractall(tmp)
    return tmp / name


def stage(inputs: Path, work: Path, tmp: Path) -> tuple[Path, Path, list[str]]:
    """Lay out a --data folder and the code. Returns (data, code root for PYTHONPATH, models)."""
    tmp.mkdir(parents=True, exist_ok=True)
    data = tmp / "data"
    data.mkdir(exist_ok=True)
    manifest = _find(inputs, "manifest.csv", want_dir=False)
    job = _find(inputs, "job.json", want_dir=False)
    if manifest is None or job is None:
        raise FileNotFoundError(f"manifest.csv and job.json must be under {inputs}")
    shutil.copy(manifest, data / "manifest.csv")
    for name in ("crops", "personal"):
        link = data / name
        if not link.exists():
            link.symlink_to(locate(inputs, name, tmp))
    (work / "runs").mkdir(parents=True, exist_ok=True)
    if not (data / "runs").exists():
        (data / "runs").symlink_to(work / "runs")
    code = locate(inputs, "stylify_ml", tmp / "src").parent
    return data, code, json.loads(job.read_text())["models"]


def main() -> int:
    inputs, work, tmp = Path("/kaggle/input"), Path("/kaggle/working"), Path("/tmp/stylify")
    data, code, models = stage(inputs, work, tmp)
    env = {**os.environ, "PYTHONPATH": str(code)}
    py = [sys.executable, "-m"]
    subprocess.run(["nvidia-smi"], check=False)
    subprocess.run([*py, "pip", "install", "-q", "timm"], check=False)  # usually preinstalled
    failed = []
    for model in models:
        print(f"== {model}", flush=True)
        before = set((work / "runs").iterdir())
        trained = subprocess.run([*py, "stylify_ml.train", "--data", str(data), "--model", model,
                                  "--workers", str(os.cpu_count() or 2)], env=env)
        new = sorted(set((work / "runs").iterdir()) - before)
        if trained.returncode != 0 or not new:
            failed.append(model)
            continue
        evaluated = subprocess.run([*py, "stylify_ml.evaluate", "--data", str(data), "--run", str(new[0])], env=env)
        if evaluated.returncode != 0:
            failed.append(model)
    print("failed:", failed or "none", flush=True)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
