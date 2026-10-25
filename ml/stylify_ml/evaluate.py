"""Score a trained run on val, the held-out user photos, and the owner's photos, and compare runs.

Held-out test rows are split again: the clothing dataset's photographers into "usersVal" and "users", and
Carousell's groups into "carousellVal" and "carousell". The two "...Val" halves pick the confidence threshold;
the others are reported. The owner's personal/ and room/ folders are scored when present.
"""

from __future__ import annotations

import argparse
import json
import tempfile
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import DataLoader

from stylify_ml.data import ManifestDataset, eval_transform, load_folder, load_image
from stylify_ml.manifest import mm_split
from stylify_ml.metrics import pick_threshold, summarise
from stylify_ml.models import load_checkpoint
from stylify_ml.train import default_device, predict

BATCH_SIZE = 32
USERS_VAL_FRACTION = 0.5  # of the test half's photographers
CAROUSELL_VAL_FRACTION = 0.5  # of Carousell's test groups
MAX_TRAINED_THRESHOLD = 0.99  # 1.0 means "never pre-fill" in the app; only the placeholder model may say that
MAX_PTE_BYTES = 20_000_000
MAX_ACCESSORY_DROP = 0.02  # val recall a candidate may lose on shoes, hat or bag against the baseline
ACCESSORIES = ("shoes", "hat", "bag")


def users_half(group: str) -> str:
    """Stable split of a test photographer into "usersVal" (picks the threshold) or "users" (reported)."""
    return "usersVal" if mm_split(f"users-val:{group}", USERS_VAL_FRACTION) == "val" else "users"


def carousell_half(group: str) -> str:
    """Stable split of a Carousell test group into "carousellVal" (picks the threshold) or "carousell" (reported)."""
    return "carousellVal" if mm_split(f"carousell-val:{group}", CAROUSELL_VAL_FRACTION) == "val" else "carousell"


def _half(row) -> str:
    return carousell_half(row.group) if row.source == "carousell" else users_half(row.group)


def _folder_probs(model, data: Path, name: str, device: str) -> tuple[np.ndarray, np.ndarray] | None:
    items = load_folder(data, name)
    if not items:
        return None
    transform = eval_transform()
    probs = []
    with torch.no_grad():
        for start in range(0, len(items), BATCH_SIZE):
            batch = torch.stack([transform(load_image(p)) for p, _ in items[start:start + BATCH_SIZE]])
            probs.append(torch.softmax(model(batch.to(device)), dim=1).cpu().numpy())
    return np.concatenate(probs), np.array([i for _, i in items], dtype=int)


def evaluate(run: Path, data: Path, device: str | None = None) -> dict:
    """Write and return `run/metrics.json`. `device` defaults to cuda, else mps, else cpu."""
    run, data = Path(run), Path(data)
    device = device or default_device()
    model, _ = load_checkpoint(run / "best.pt")
    model.to(device)
    val = DataLoader(ManifestDataset(data, "val", eval_transform()), batch_size=BATCH_SIZE)
    val_probs, val_targets = predict(model, val, device)
    personal = _folder_probs(model, data, "personal", device)
    room = _folder_probs(model, data, "room", device)
    test_rows = ManifestDataset(data, "test", eval_transform()).rows
    halves = {}
    for half in ("usersVal", "users", "carousellVal", "carousell"):
        test_set = ManifestDataset(data, "test", eval_transform())
        test_set.rows = [r for r in test_rows if _half(r) == half]
        halves[half] = predict(model, DataLoader(test_set, batch_size=BATCH_SIZE), device) if test_set.rows else None
    pickers = [h for h in ("usersVal", "carousellVal") if halves[h] is not None]
    if pickers:
        threshold_from = "+".join(pickers)
        probs = np.concatenate([halves[h][0] for h in pickers])
        targets = np.concatenate([halves[h][1] for h in pickers])
    else:
        threshold_from, probs, targets = "val", val_probs, val_targets
    picked = pick_threshold(probs, targets)
    metrics = {
        "val": summarise(val_probs, val_targets),
        **{h: summarise(*halves[h]) if halves[h] is not None else None for h in halves},
        "personal": summarise(*personal) if personal is not None else None,
        "room": summarise(*room) if room is not None else None,
        "threshold": min(picked, MAX_TRAINED_THRESHOLD),
        "thresholdFrom": threshold_from,
        "thresholdCapped": picked > MAX_TRAINED_THRESHOLD,
        "pteBytes": None,
    }
    (run / "metrics.json").write_text(json.dumps(metrics, indent=2) + "\n")
    return metrics


def _pte_bytes(run: Path, metrics: dict) -> int | None:
    """Export once to a temp file and cache the size in metrics.json. None where ExecuTorch is not installed."""
    if metrics.get("pteBytes") is None:
        try:
            from stylify_ml.export import export_pte  # ExecuTorch is only installed where models are exported
        except ImportError:
            return None

        model, _ = load_checkpoint(run / "best.pt")
        with tempfile.TemporaryDirectory() as tmp:
            metrics["pteBytes"] = export_pte(model, Path(tmp) / "classifier.pte")
        (run / "metrics.json").write_text(json.dumps(metrics, indent=2) + "\n")
    return metrics["pteBytes"]


def _fmt(value: float | None) -> str:
    return "-" if value is None else f"{value:.3f}"


def _top1(metrics: dict, key: str) -> float | None:
    part = metrics.get(key)
    return part["top1"] if part else None


def _mean_top1(metrics: dict) -> float | None:
    """Mean of users and Carousell top-1; the winner's measure."""
    scores = [s for s in (_top1(metrics, "users"), _top1(metrics, "carousell")) if s is not None]
    return sum(scores) / len(scores) if scores else None


def _accessory_recalls(metrics: dict) -> list[float | None]:
    per_label = metrics["val"].get("per_label", {})
    return [per_label.get(label, {}).get("recall") for label in ACCESSORIES]


def _verdict(metrics: dict, size: int | None, baseline: dict) -> str:
    if any(_top1(baseline, k) is not None and _top1(metrics, k) is None for k in ("users", "carousell")):
        return "unscored"  # evaluated before the baseline's test sets existed: re-evaluate it to compare
    if size is not None and size > MAX_PTE_BYTES:
        return "too-big"
    for mine, base in zip(_accessory_recalls(metrics), _accessory_recalls(baseline)):
        if mine is not None and base is not None and base - mine > MAX_ACCESSORY_DROP:
            return "acc-drop"
    return "ok"


def compare(data: Path, baseline: str | None = None) -> str:
    """A table of every evaluated run. With a baseline run id, mark each run ok / unscored / acc-drop / too-big and name
    the winner: the best mean of users and Carousell top-1 among ok runs, tie-break val balanced accuracy."""
    header = ("run", "model", "val bacc", "users top1", "carousell top1", "mean top1", "users top3",
              "personal top1", "room top1", "shoes/hat/bag", "threshold", ".pte MB")
    if baseline:
        header += ("verdict",)
    runs = []
    for metrics_path in sorted(Path(data).glob("runs/*/metrics.json")):
        run = metrics_path.parent
        metrics = json.loads(metrics_path.read_text())
        config_path = run / "config.json"
        model = json.loads(config_path.read_text())["model_name"] if config_path.exists() else "?"
        runs.append((run, model, metrics, _pte_bytes(run, metrics)))
    base = next((m for r, _, m, _ in runs if r.name == baseline), None) if baseline else None
    if baseline and base is None:
        raise ValueError(f"baseline run {baseline!r} has no metrics.json under {Path(data) / 'runs'}")
    rows, eligible = [header], []
    for run, model, metrics, size in runs:
        row = (
            run.name,
            model,
            _fmt(metrics["val"]["balanced_accuracy"]),
            _fmt(_top1(metrics, "users")),
            _fmt(_top1(metrics, "carousell")),
            _fmt(_mean_top1(metrics)),
            _fmt(metrics["users"]["top3"] if metrics.get("users") else None),
            _fmt(_top1(metrics, "personal")),
            _fmt(_top1(metrics, "room")),
            "/".join(_fmt(r) for r in _accessory_recalls(metrics)),
            _fmt(metrics["threshold"]),
            f"{size / 1e6:.1f}" if size is not None else "-",
        )
        if base is not None:
            verdict = _verdict(metrics, size, base)
            row += (verdict,)
            if verdict == "ok" and _mean_top1(metrics) is not None:
                eligible.append((_mean_top1(metrics), metrics["val"]["balanced_accuracy"], run.name))
        rows.append(row)
    widths = [max(len(r[i]) for r in rows) for i in range(len(header))]
    lines = ["  ".join(cell.ljust(w) for cell, w in zip(r, widths)).rstrip() for r in rows]
    if base is not None:
        lines.append(f"winner: {max(eligible)[2]}" if eligible else "winner: none")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, required=True)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--run", type=Path, help="run directory to evaluate")
    mode.add_argument("--compare", action="store_true", help="print a table of every evaluated run")
    parser.add_argument("--baseline", default=None, help="with --compare: run id to guard against and to beat")
    parser.add_argument("--device", default=None, help="default: cuda, else mps, else cpu")
    args = parser.parse_args(argv)
    if args.compare:
        print(compare(args.data, args.baseline))
    else:
        m = evaluate(args.run, args.data, args.device)
        personal, users = m["personal"], m["users"]
        print(f"val balanced accuracy {m['val']['balanced_accuracy']:.4f}, "
              f"threshold {m['threshold']:.4f} (from {m['thresholdFrom']}), "
              f"users top-1 {_fmt(users['top1'] if users else None)}, "
              f"carousell top-1 {_fmt(_top1(m, 'carousell'))}, room top-1 {_fmt(_top1(m, 'room'))}, "
              f"personal top-1 {_fmt(personal['top1'] if personal else None)}")


if __name__ == "__main__":
    main()
