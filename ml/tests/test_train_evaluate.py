import json
import shutil
import subprocess
import sys

import pytest
import torch
from PIL import Image

try:
    from stylify_ml import export
except ImportError:  # the gaming PC installs without ExecuTorch
    export = None
from stylify_ml import evaluate as evaluate_module
from stylify_ml.evaluate import carousell_half, compare, evaluate, users_half
from stylify_ml.labels import LABELS
from stylify_ml.manifest import Row, read_manifest, write_manifest
from stylify_ml import train as train_module
from stylify_ml.train import default_device, train

needs_executorch = pytest.mark.skipif(export is None, reason="ExecuTorch is not installed")

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


@needs_executorch
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
    assert set(m) == {"val", "usersVal", "users", "carousellVal", "carousell", "personal", "room", "threshold",
                      "thresholdFrom", "thresholdCapped", "pteBytes"}
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


@needs_executorch
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
                              "usersTop3": metrics["users"]["top3"],
                              "carousellTop1": None, "carousellTop3": None}


@needs_executorch
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


@needs_executorch
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


@needs_executorch
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


def _with_carousell_and_room(data, tmp_path):
    """A copy of the tiny data with Carousell test rows in both halves and a room/ folder."""
    copy = tmp_path / "data"
    shutil.copytree(data, copy)
    rows = read_manifest(copy / "manifest.csv")
    want = {"carousellVal": [], "carousell": []}
    i = 0
    while min(len(v) for v in want.values()) < 9:
        group = f"carousell:g{i}"
        want[carousell_half(group)].append(group)
        i += 1
    for half, groups in want.items():
        for (label, colour), group in zip(zip(LABELS, COLOURS), groups):
            rel = f"crops/{label}_c_{half}.png"
            Image.new("RGB", (64, 64), colour).save(copy / rel)
            rows.append(Row(rel, label, "carousell", "test", group, "user"))
    write_manifest(copy / "manifest.csv", rows)
    for label, colour in zip(LABELS, COLOURS):
        (copy / "room" / label).mkdir(parents=True)
        Image.new("RGB", (64, 64), colour).save(copy / "room" / label / "r.jpg")
    return copy


def test_users_ignore_carousell_rows(tiny_run, tmp_path):
    data, run = tiny_run
    copy = _with_carousell_and_room(data, tmp_path)
    m = evaluate(copy / "runs" / run.name, copy, device="cpu")
    assert m["usersVal"]["n"] + m["users"]["n"] == 9


def test_carousell_halves_reported(tiny_run, tmp_path):
    data, run = tiny_run
    copy = _with_carousell_and_room(data, tmp_path)
    m = evaluate(copy / "runs" / run.name, copy, device="cpu")
    assert m["carousellVal"]["n"] == 9 and m["carousell"]["n"] == 9
    assert m["thresholdFrom"] == "usersVal+carousellVal"


def test_threshold_without_carousell_falls_back(tiny_run, tmp_path):
    data, run = tiny_run
    copy = tmp_path / "data"
    shutil.copytree(data, copy)
    m = evaluate(copy / "runs" / run.name, copy, device="cpu")
    assert m["thresholdFrom"] == "usersVal"
    assert m["carousell"] is None and m["carousellVal"] is None


def test_threshold_is_capped(tiny_run, tmp_path, monkeypatch):
    data, run = tiny_run
    copy = tmp_path / "data"
    shutil.copytree(data, copy)
    monkeypatch.setattr(evaluate_module, "pick_threshold", lambda p, t: 1.0)
    m = evaluate(copy / "runs" / run.name, copy, device="cpu")
    assert m["threshold"] == 0.99 and m["thresholdCapped"] is True


def test_room_folder_scored_when_present(tiny_run, tmp_path):
    data, run = tiny_run
    copy = _with_carousell_and_room(data, tmp_path)
    m = evaluate(copy / "runs" / run.name, copy, device="cpu")
    assert m["room"]["n"] == 9
    plain = tmp_path / "plain"
    shutil.copytree(data, plain)
    assert evaluate(plain / "runs" / run.name, plain, device="cpu")["room"] is None


def _write_run(data, name, *, users, carousell, recalls, val_bacc=0.9):
    run = data / "runs" / name
    run.mkdir(parents=True)
    per_label = {label: {"precision": 1.0, "recall": 1.0, "support": 1} for label in LABELS}
    for label, recall in recalls.items():
        per_label[label]["recall"] = recall
    summary = lambda top1: {"n": 10, "top1": top1, "top3": 1.0, "balanced_accuracy": top1, "per_label": per_label}
    metrics = {"val": {"n": 10, "top1": val_bacc, "top3": 1.0, "balanced_accuracy": val_bacc, "per_label": per_label},
               "usersVal": summary(users), "users": summary(users),
               "carousellVal": summary(carousell) if carousell is not None else None,
               "carousell": summary(carousell) if carousell is not None else None,
               "personal": None, "room": None, "threshold": 0.7, "thresholdFrom": "usersVal",
               "thresholdCapped": False, "pteBytes": 16_000_000}
    if carousell is None:  # an old run, evaluated before Carousell
        for key in ("carousellVal", "carousell", "room", "thresholdCapped"):
            del metrics[key]
    (run / "metrics.json").write_text(json.dumps(metrics))
    (run / "config.json").write_text(json.dumps({"model_name": "efficientnet_b0"}))


def test_compare_old_metrics_prints_dashes(tmp_path):
    _write_run(tmp_path, "old", users=0.89, carousell=None, recalls={})
    line = compare(tmp_path).splitlines()[1]
    assert line.split()[0] == "old" and line.split()[4] == "-"  # carousell top1


def test_compare_baseline_guard_and_winner(tmp_path):
    _write_run(tmp_path, "base", users=0.89, carousell=0.70, recalls={"shoes": 0.99})
    _write_run(tmp_path, "worse-shoes", users=0.90, carousell=0.85, recalls={"shoes": 0.96})
    table = compare(tmp_path, baseline="base")
    assert [l for l in table.splitlines() if l.startswith("worse-shoes")][0].split()[-1] == "acc-drop"
    assert table.splitlines()[-1] == "winner: base"
    _write_run(tmp_path, "good", users=0.90, carousell=0.85, recalls={"shoes": 0.98})
    table = compare(tmp_path, baseline="base")
    assert [l for l in table.splitlines() if l.startswith("good")][0].split()[-1] == "ok"
    assert table.splitlines()[-1] == "winner: good"


def test_train_records_source_weights_and_augment(tiny_run):
    data, _ = tiny_run
    run = train(data, "mobilenet_v3_large", head_epochs=1, full_epochs=0, batch_size=4, pretrained=False,
                device="cpu", run_id="sw", workers=0, source_weights={"carousell": 3.0}, augment="strong")
    config = json.loads((run / "config.json").read_text())
    assert config["source_weights"] == {"carousell": 3.0} and config["augment"] == "strong"
    shutil.rmtree(run)  # keep the shared fixture's runs/ to the one run other tests expect


def test_parse_source_weight():
    args = train_module.build_parser().parse_args(
        ["--data", "d", "--model", "efficientnet_b0", "--source-weight", "carousell=4", "--source-weight", "web=0.5"])
    assert args.source_weight == {"carousell": 4.0, "web": 0.5}
    with pytest.raises(SystemExit):
        train_module.build_parser().parse_args(["--data", "d", "--model", "efficientnet_b0", "--source-weight", "carousell"])


def test_compare_without_executorch_shows_dash(tmp_path, monkeypatch):
    _write_run(tmp_path, "r", users=0.9, carousell=0.8, recalls={})
    metrics_path = tmp_path / "runs" / "r" / "metrics.json"
    metrics = json.loads(metrics_path.read_text())
    metrics["pteBytes"] = None
    metrics_path.write_text(json.dumps(metrics))
    (tmp_path / "runs" / "r" / "best.pt").write_bytes(b"x")
    monkeypatch.setitem(sys.modules, "stylify_ml.export", None)  # import fails, as on the PC
    line = compare(tmp_path).splitlines()[1]
    assert line.split()[-1] == "-"


def _fake_scores(monkeypatch, float_top1, int8_top1):
    def score(pte_path, data, half):
        top1 = int8_top1 if "int8" in str(pte_path) else float_top1
        return {"n": 9, "top1": top1, "top3": 1.0}
    monkeypatch.setattr(export, "score_pte", score)


@needs_executorch
def test_export_int8_refuses_when_accuracy_drops(tiny_run, tmp_path, monkeypatch):
    data, run = tiny_run
    if not (run / "metrics.json").exists():
        evaluate(run, data)
    _fake_scores(monkeypatch, 0.90, 0.85)
    out = tmp_path / "out"
    with pytest.raises(SystemExit):
        export.main(["--run", str(run), "--out", str(out), "--int8", "--calibration-size", "9"])
    assert not (out / "classifier.pte").exists()


@needs_executorch
def test_export_int8_writes_when_close(tiny_run, tmp_path, monkeypatch):
    data, run = tiny_run
    if not (run / "metrics.json").exists():
        evaluate(run, data)
    _fake_scores(monkeypatch, 0.90, 0.895)
    monkeypatch.setattr(export, "check_top1_agreement", lambda *a, **k: 1.0)  # untrained: top-1 is noise
    out = tmp_path / "out"
    export.main(["--run", str(run), "--out", str(out), "--int8", "--calibration-size", "9"])
    meta = json.loads((out / "classifier.json").read_text())
    assert meta["quantized"] == "int8" and (out / "classifier.pte").stat().st_size > 0
