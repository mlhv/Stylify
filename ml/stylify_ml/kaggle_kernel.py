"""Runs on Kaggle, not locally: train and evaluate each model in job.json on the GPU.

Uses only the standard library, so it can find and unpack the code before importing it. Reads the
private datasets that `stylify_ml.bundle` staged, works in /tmp (so the 1.7 GB of crops are not saved
as kernel output), and writes one folder per run to /kaggle/working/runs/.

job.json holds either {"models": [...]}, each trained with the defaults, or {"jobs": [...]}, a sweep file run
through `stylify_ml.jobqueue` within QUEUE_HOURS of the kernel starting, with its logs in /kaggle/working/logs/.
"""

from __future__ import annotations

import csv
import json
import os
import shutil
import subprocess
import sys
import time
import zipfile
from pathlib import Path

# Kaggle stops a session at 12 hours and may then keep no output: start no job that would end after this.
QUEUE_HOURS = 10.5


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


def stage(inputs: Path, work: Path, tmp: Path) -> tuple[Path, Path, dict]:
    """Lay out a --data folder and the code. Returns (data, code root for PYTHONPATH, job.json's contents)."""
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
    with (data / "manifest.csv").open(newline="") as f:
        paths = [row["path"] for row in csv.DictReader(f)]
    missing = [p for p in paths if not (data / p).is_file()]
    if missing:  # an old crops upload with a new manifest: fail now, not inside the first epoch
        raise FileNotFoundError(f"{len(missing)} of {len(paths)} crops in manifest.csv are not in the data, "
                                f"e.g. {missing[0]}; upload crops.zip again")
    for name in ("runs", "logs"):
        (work / name).mkdir(parents=True, exist_ok=True)
        if not (data / name).exists():
            (data / name).symlink_to(work / name)
    code = locate(inputs, "stylify_ml", tmp / "src").parent
    return data, code, json.loads(job.read_text())


def run_jobs(data: Path, tmp: Path, jobs: list[dict], hours: float, py: list[str], env: dict) -> int:
    jobs_file = tmp / "jobs.json"
    jobs_file.write_text(json.dumps(jobs))
    return subprocess.run([*py, "stylify_ml.jobqueue", "--data", str(data), "--jobs", str(jobs_file),
                           "--hours", f"{hours:.2f}"], env=env).returncode


def main() -> int:
    started = time.monotonic()
    inputs, work, tmp = Path("/kaggle/input"), Path("/kaggle/working"), Path("/tmp/stylify")
    data, code, job = stage(inputs, work, tmp)
    env = {**os.environ, "PYTHONPATH": str(code)}
    py = [sys.executable, "-m"]
    subprocess.run(["nvidia-smi"], check=False)
    subprocess.run([*py, "pip", "install", "-q", "timm"], check=False)  # usually preinstalled
    if "jobs" in job:
        hours = QUEUE_HOURS - (time.monotonic() - started) / 3600
        return run_jobs(data, tmp, job["jobs"], hours, py, env)
    models = job["models"]
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
