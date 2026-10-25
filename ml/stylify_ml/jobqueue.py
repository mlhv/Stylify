"""Run a list of training jobs one after another, each followed by its evaluation. Safe to stop and restart.

A job is {"run_id": ..., "args": [...]}, where args go to `stylify_ml.train` after --data and --run-id.
On a restart, finished runs (metrics.json) are skipped, trained-but-unevaluated runs (best.pt) are only
evaluated, and half-written runs are moved to runs/_failed/ and trained again. With --stop-at, a job is not
started if the longest job so far would not finish by then.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Callable


def subprocess_runner(cmd: list[str], log: Path) -> int:
    with log.open("a") as f:
        f.write(f"$ {' '.join(cmd)}\n")
        f.flush()
        return subprocess.run(cmd, stdout=f, stderr=subprocess.STDOUT).returncode


def _train_cmd(data: Path, job: dict) -> list[str]:
    return [sys.executable, "-m", "stylify_ml.train", "--data", str(data), "--run-id", job["run_id"], *job["args"]]


def _evaluate_cmd(data: Path, run: Path) -> list[str]:
    return [sys.executable, "-m", "stylify_ml.evaluate", "--data", str(data), "--run", str(run)]


def run_queue(data: Path, jobs: list[dict], stop_at: datetime | None = None,
              runner: Callable[[list[str], Path], int] = subprocess_runner,
              now: Callable[[], datetime] = datetime.now) -> list[str]:
    """Run the jobs in order; return the run ids finished in this call."""
    data = Path(data)
    (data / "logs").mkdir(parents=True, exist_ok=True)
    finished: list[str] = []
    longest: timedelta | None = None
    for job in jobs:
        run_id = job["run_id"]
        run = data / "runs" / run_id
        log = data / "logs" / f"{run_id}.log"
        if (run / "metrics.json").exists():
            print(f"{run_id}: already finished", flush=True)
            continue
        if stop_at is not None and longest is not None and now() + longest > stop_at:
            print(f"{run_id}: skipped, would not finish by {stop_at:%H:%M}", flush=True)
            continue
        started = now()
        if run.exists() and not (run / "best.pt").exists():
            aside = data / "runs" / "_failed" / f"{run_id}-{datetime.now(timezone.utc):%Y%m%d-%H%M%S}"
            aside.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(run, aside)
            print(f"{run_id}: half-written run moved to {aside}", flush=True)
        if not run.exists():
            print(f"{run_id}: training (log {log})", flush=True)
            if runner(_train_cmd(data, job), log) != 0:
                print(f"{run_id}: train failed, see {log}", flush=True)
                continue
        print(f"{run_id}: evaluating", flush=True)
        if runner(_evaluate_cmd(data, run), log) != 0:
            print(f"{run_id}: evaluate failed, see {log}", flush=True)
            continue
        took = now() - started
        longest = took if longest is None else max(longest, took)
        print(f"{run_id}: finished in {took}", flush=True)
        finished.append(run_id)
    print(f"finished this time: {', '.join(finished) or 'none'}", flush=True)
    return finished


def _stop_time(text: str) -> datetime:
    """HH:MM today, local time."""
    hours, minutes = (int(part) for part in text.split(":"))
    return datetime.now().replace(hour=hours, minute=minutes, second=0, microsecond=0)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--jobs", type=Path, required=True, help="JSON list of jobs, e.g. sweeps/sweep.json")
    parser.add_argument("--stop-at", type=_stop_time, default=None, help="HH:MM today: start no job that cannot finish")
    args = parser.parse_args(argv)
    run_queue(args.data.expanduser().resolve(), json.loads(args.jobs.read_text()), stop_at=args.stop_at)


if __name__ == "__main__":
    main()
