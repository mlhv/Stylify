import json
import shutil
import subprocess
import sys

import pytest
import torch
from PIL import Image

from stylify_ml import export
from stylify_ml import evaluate as evaluate_module
from stylify_ml.evaluate import compare, evaluate, users_half
from stylify_ml.labels import LABELS
from stylify_ml.manifest import Row, write_manifest
from stylify_ml.train import default_device, train

COLOURS = [(220, 20, 20), (20, 220, 20), (20, 20, 220), (220, 220, 20), (220, 20, 220),
           (20, 220, 220), (240, 240, 240), (15, 15, 15), (128, 64, 0)]


def _fake_data(root):
    data = root / "data"
    rows = []
    for label, colour in zip(LABELS, COLOURS):
        for split, n in (("train", 2), ("val", 1), ("test", 1)):
            for i in range(n):
                rel = f"crops/{label}_{split}_{i}.png"
                (data / "crops").mkdir(parents=True, exist_ok=True)
                Image.new("RGB", (64, 64), colour).save(data / rel)
                rows.append(Row(rel, label, "df2", split, f"{label}{i}", "shop"))
        (data / "personal" / label).mkdir(parents=True)
        Image.new("RGB", (64, 64), colour).save(data / "personal" / label / "p.jpg")
    write_manifest(data / "manifest.csv", rows)
    return data


@pytest.fixture(scope="module")
def tiny_run(tmp_path_factory):
    data = _fake_data(tmp_path_factory.mktemp("e2e"))
    run = train(data, "mobilenet_v3_large", head_epochs=1, full_epochs=1, batch_size=4,
                pretrained=False, device="cpu", run_id="t1", workers=0)
    return data, run


def test_train_then_evaluate_then_compare(tiny_run):
    data, run = tiny_run
    assert {"config.json", "epochs.jsonl", "best.pt"} <= {p.name for p in run.iterdir()}
    epochs = [json.loads(line) for line in (run / "epochs.jsonl").read_text().splitlines()]
    assert len(epochs) == 2
    assert [(e["phase"], e["epoch"]) for e in epochs] == [("head", 1), ("full", 1)]
    config = json.loads((run / "config.json").read_text())
    assert config["data"] == str(data) and config["run_id"] == "t1" and config["device"] == "cpu"
    assert config["amp"] is False
    m = evaluate(run, data)
    assert set(m) == {"val", "usersVal", "users", "personal", "threshold", "thresholdFrom", "pteBytes"}
    assert 0.0 <= m["threshold"] <= 1.0 and m["personal"] is not None
    assert m["val"]["n"] == 9 and m["personal"]["n"] == 9
    assert m["usersVal"]["n"] + m["users"]["n"] == 9 and m["usersVal"]["n"] > 0 and m["users"]["n"] > 0
    assert m["thresholdFrom"] == "usersVal"
    table = compare(data)
    assert "t1" in table
    cached = json.loads((run / "metrics.json").read_text())["pteBytes"]
    assert isinstance(cached, int) and cached > 0
    assert compare(data) == table


def test_users_half_is_stable_and_splits_photographers():
    groups = [f"clothing:{i}" for i in range(400)]
    halves = [users_half(g) for g in groups]
    assert set(halves) == {"usersVal", "users"}
    assert 150 < halves.count("usersVal") < 250
    assert halves == [users_half(g) for g in groups]
    assert users_half("clothing:322") == users_half("clothing:322")


def test_threshold_is_picked_on_users_val(tiny_run, tmp_path, monkeypatch):
    data, run = tiny_run
    copy = tmp_path / "data"
    shutil.copytree(data, copy)
    seen = []
    real = evaluate_module.pick_threshold
    monkeypatch.setattr(evaluate_module, "pick_threshold", lambda p, t: seen.append(len(t)) or real(p, t))
    m = evaluate(copy / "runs" / run.name, copy, device="cpu")
    assert seen == [m["usersVal"]["n"]]


def test_threshold_falls_back_to_val_without_users(tiny_run, tmp_path):
    data, run = tiny_run
    copy = tmp_path / "data"
    shutil.copytree(data, copy)
    manifest = copy / "manifest.csv"
    manifest.write_text("".join(l for l in manifest.read_text().splitlines(keepends=True) if ",test," not in l))
    m = evaluate(copy / "runs" / run.name, copy, device="cpu")
    assert m["users"] is None and m["usersVal"] is None and m["thresholdFrom"] == "val"


def test_train_refuses_an_existing_run(tiny_run):
    data, _ = tiny_run
    with pytest.raises(FileExistsError):
        train(data, "mobilenet_v3_large", head_epochs=1, full_epochs=1, pretrained=False,
              device="cpu", run_id="t1", workers=0)


def test_evaluate_without_personal(tiny_run, tmp_path):
    data, run = tiny_run
    copy = tmp_path / "data"
    shutil.copytree(data, copy, ignore=shutil.ignore_patterns("personal"))  # keeps the shared run untouched
    m = evaluate(copy / "runs" / run.name, copy)
    assert m["personal"] is None
    assert "-" in compare(copy).splitlines()[1].split()


def test_export_run_writes_both_files(tiny_run, tmp_path):
    data, run = tiny_run
    if not (run / "metrics.json").exists():
        evaluate(run, data)
    metrics = json.loads((run / "metrics.json").read_text())
    out = tmp_path / "out"
    export.main(["--run", str(run), "--out", str(out)])
    meta = json.loads((out / "classifier.json").read_text())
    assert (out / "classifier.pte").stat().st_size > 0
    assert meta["run"] == "t1" and meta["model"] == "mobilenet_v3_large"
    assert meta["threshold"] == metrics["threshold"]
    assert meta["scores"] == {"valBalancedAccuracy": metrics["val"]["balanced_accuracy"],
                              "personalTop1": metrics["personal"]["top1"],
                              "personalTop3": metrics["personal"]["top3"],
                              "usersTop1": metrics["users"]["top1"],
                              "usersTop3": metrics["users"]["top3"]}


def test_export_run_writes_nothing_when_parity_fails(tiny_run, tmp_path, monkeypatch):
    data, run = tiny_run
    if not (run / "metrics.json").exists():
        evaluate(run, data)

    def fail(*args, **kwargs):
        raise export.ParityError("forced")

    monkeypatch.setattr(export, "check_parity", fail)
    out = tmp_path / "out"
    with pytest.raises(export.ParityError):
        export.main(["--run", str(run), "--out", str(out)])
    assert not (out / "classifier.json").exists() and not (out / "classifier.pte").exists()


def test_placeholder_writes_nothing_when_parity_fails(tmp_path, monkeypatch):
    def fail(*args, **kwargs):
        raise export.ParityError("forced")

    monkeypatch.setattr(export, "check_parity", fail)
    with pytest.raises(export.ParityError):
        export.main(["--placeholder", "--out", str(tmp_path)])
    assert not (tmp_path / "classifier.json").exists() and not (tmp_path / "classifier.pte").exists()


def test_default_device_prefers_cuda(monkeypatch):
    monkeypatch.setattr(torch.cuda, "is_available", lambda: True)
    assert default_device() == "cuda"
    monkeypatch.setattr(torch.cuda, "is_available", lambda: False)
    monkeypatch.setattr(torch.backends.mps, "is_available", lambda: False)
    assert default_device() == "cpu"


def test_mixed_precision_needs_cuda(tiny_run):
    data, _ = tiny_run
    with pytest.raises(ValueError, match="CUDA"):
        train(data, "mobilenet_v3_large", pretrained=False, device="cpu", run_id="amp", amp=True, workers=0)
    assert not (data / "runs" / "amp").exists()


def test_evaluate_on_an_explicit_device(tiny_run, tmp_path):
    data, run = tiny_run
    copy = tmp_path / "data"
    shutil.copytree(data, copy)
    m = evaluate(copy / "runs" / run.name, copy, device="cpu")
    assert m["val"]["n"] == 9 and m["personal"]["n"] == 9


def test_train_and_evaluate_import_without_executorch():
    # Kaggle has no ExecuTorch: training and evaluation must not import it.
    code = "import sys; import stylify_ml.train, stylify_ml.evaluate; print('executorch' in sys.modules)"
    out = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, check=True)
    assert out.stdout.strip() == "False"


def test_export_run_trained_elsewhere_finds_its_data(tiny_run, tmp_path):
    data, run = tiny_run
    if not (run / "metrics.json").exists():
        evaluate(run, data)
    copy = tmp_path / "data"
    shutil.copytree(data, copy)
    moved = copy / "runs" / run.name
    config = json.loads((moved / "config.json").read_text())
    config["data"] = "/tmp/stylify/data-on-kaggle"  # recorded path that does not exist here
    (moved / "config.json").write_text(json.dumps(config))
    out = tmp_path / "out"
    export.main(["--run", str(moved), "--out", str(out)])
    assert (out / "classifier.pte").stat().st_size > 0
