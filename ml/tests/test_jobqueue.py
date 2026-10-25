import json
from datetime import datetime, timedelta
from pathlib import Path

import pytest

from stylify_ml import train as train_module
from stylify_ml.jobqueue import run_queue

SWEEPS = Path(__file__).resolve().parent.parent / "sweeps"


class FakeRunner:
    """Acts like train/evaluate: train writes best.pt, evaluate writes metrics.json. Advances a fake clock."""

    def __init__(self, data: Path, minutes: float = 0, fail: set[str] = frozenset()):
        self.data, self.minutes, self.fail = data, minutes, fail
        self.calls: list[tuple[str, str]] = []
        self.time = datetime(2026, 10, 25, 16, 0)

    def now(self) -> datetime:
        return self.time

    def __call__(self, cmd: list[str], log: Path) -> int:
        module = cmd[cmd.index("-m") + 1].rsplit(".", 1)[1]
        if module == "train":
            run_id = cmd[cmd.index("--run-id") + 1]
        else:
            run_id = Path(cmd[cmd.index("--run") + 1]).name
        self.calls.append((module, run_id))
        assert log.parent.is_dir()
        if run_id in self.fail:
            return 1
        run = self.data / "runs" / run_id
        if module == "train":
            self.time += timedelta(minutes=self.minutes)
            run.mkdir(parents=True)
            (run / "best.pt").write_bytes(b"x")
            (run / "trained.json").write_text("{}")
        else:
            (run / "metrics.json").write_text("{}")
        return 0


def _jobs(*ids):
    return [{"run_id": i, "args": ["--model", "efficientnet_b0"]} for i in ids]


def test_runs_train_then_evaluate(tmp_path):
    runner = FakeRunner(tmp_path)
    assert run_queue(tmp_path, _jobs("a", "b"), runner=runner, now=runner.now) == ["a", "b"]
    assert runner.calls == [("train", "a"), ("evaluate", "a"), ("train", "b"), ("evaluate", "b")]


def test_skips_finished_runs(tmp_path):
    (tmp_path / "runs" / "a").mkdir(parents=True)
    (tmp_path / "runs" / "a" / "metrics.json").write_text("{}")
    runner = FakeRunner(tmp_path)
    assert run_queue(tmp_path, _jobs("a"), runner=runner, now=runner.now) == []
    assert runner.calls == []


def test_evaluates_trained_run_without_metrics(tmp_path):
    (tmp_path / "runs" / "a").mkdir(parents=True)
    (tmp_path / "runs" / "a" / "best.pt").write_bytes(b"x")
    (tmp_path / "runs" / "a" / "trained.json").write_text("{}")
    runner = FakeRunner(tmp_path)
    assert run_queue(tmp_path, _jobs("a"), runner=runner, now=runner.now) == ["a"]
    assert runner.calls == [("evaluate", "a")]


def test_moves_half_written_run_aside(tmp_path):
    (tmp_path / "runs" / "a").mkdir(parents=True)
    (tmp_path / "runs" / "a" / "config.json").write_text("{}")
    runner = FakeRunner(tmp_path)
    assert run_queue(tmp_path, _jobs("a"), runner=runner, now=runner.now) == ["a"]
    assert runner.calls == [("train", "a"), ("evaluate", "a")]
    moved = list((tmp_path / "runs" / "_failed").iterdir())
    assert len(moved) == 1 and moved[0].name.startswith("a-") and (moved[0] / "config.json").exists()


def test_stop_at_skips_jobs_that_cannot_finish(tmp_path):
    runner = FakeRunner(tmp_path, minutes=120)
    stop_at = runner.time + timedelta(minutes=180)  # the first job ends at +120, a second would end at +240
    assert run_queue(tmp_path, _jobs("a", "b"), stop_at=stop_at, runner=runner, now=runner.now) == ["a"]
    assert ("train", "b") not in runner.calls


def test_failed_job_does_not_stop_the_queue(tmp_path, capsys):
    runner = FakeRunner(tmp_path, fail={"a"})
    assert run_queue(tmp_path, _jobs("a", "b"), runner=runner, now=runner.now) == ["b"]
    assert ("train", "b") in runner.calls
    assert "a: train failed" in capsys.readouterr().out


@pytest.mark.parametrize("path", sorted(SWEEPS.glob("*.json")), ids=lambda p: p.name)
def test_job_files_are_valid(path):
    jobs = json.loads(path.read_text())
    ids = [job["run_id"] for job in jobs]
    assert len(ids) == len(set(ids)) and jobs
    for job in jobs:
        train_module.build_parser().parse_args(["--data", "d", "--run-id", job["run_id"], *job["args"]])


def test_sweep_files_exist():
    assert {p.name for p in SWEEPS.glob("*.json")} >= {"first.json", "sweep.json"}


def test_checkpoint_without_trained_marker_is_retrained(tmp_path):
    # interrupted mid-training: best.pt from an early epoch, but train never finished
    (tmp_path / "runs" / "a").mkdir(parents=True)
    (tmp_path / "runs" / "a" / "best.pt").write_bytes(b"early")
    runner = FakeRunner(tmp_path)
    assert run_queue(tmp_path, _jobs("a"), runner=runner, now=runner.now) == ["a"]
    assert runner.calls == [("train", "a"), ("evaluate", "a")]
    assert len(list((tmp_path / "runs" / "_failed").iterdir())) == 1


def test_train_that_fails_after_a_checkpoint_is_retrained_next_time(tmp_path):
    class Crashes(FakeRunner):
        def __call__(self, cmd, log):
            if "train" in cmd[cmd.index("-m") + 1] and not self.calls:
                self.calls.append(("train", "a"))
                (self.data / "runs" / "a").mkdir(parents=True)
                (self.data / "runs" / "a" / "best.pt").write_bytes(b"early")
                return 1
            return super().__call__(cmd, log)

    runner = Crashes(tmp_path)
    assert run_queue(tmp_path, _jobs("a"), runner=runner, now=runner.now) == []
    assert run_queue(tmp_path, _jobs("a"), runner=runner, now=runner.now) == ["a"]
    assert runner.calls[1:] == [("train", "a"), ("evaluate", "a")]


def test_second_queue_refuses_to_start(tmp_path):
    import fcntl

    (tmp_path / "logs").mkdir()
    with (tmp_path / "logs" / "queue.lock").open("w") as held:
        fcntl.flock(held, fcntl.LOCK_EX | fcntl.LOCK_NB)
        runner = FakeRunner(tmp_path)
        with pytest.raises(SystemExit, match="already running"):
            run_queue(tmp_path, _jobs("a"), runner=runner, now=runner.now)
        assert runner.calls == []
