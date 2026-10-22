"""Score a trained run on val, the clothing dataset's test half ("users") and personal photos, and compare runs."""

from __future__ import annotations

import argparse
import json
import tempfile
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import DataLoader

from stylify_ml.data import ManifestDataset, eval_transform, load_image, load_personal
from stylify_ml.metrics import pick_threshold, summarise
from stylify_ml.models import load_checkpoint
from stylify_ml.train import default_device, predict

BATCH_SIZE = 32


def _personal_probs(model, data: Path, device: str) -> tuple[np.ndarray, np.ndarray] | None:
    items = load_personal(data)
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
    personal = _personal_probs(model, data, device)
    test_set = ManifestDataset(data, "test", eval_transform())
    users = predict(model, DataLoader(test_set, batch_size=BATCH_SIZE), device) if len(test_set) else None
    metrics = {
        "val": summarise(val_probs, val_targets),
        "users": summarise(*users) if users is not None else None,
        "personal": summarise(*personal) if personal is not None else None,
        "threshold": pick_threshold(val_probs, val_targets),
        "pteBytes": None,
    }
    (run / "metrics.json").write_text(json.dumps(metrics, indent=2) + "\n")
    return metrics


def _pte_bytes(run: Path, metrics: dict) -> int:
    """Export once to a temp file and cache the size in metrics.json."""
    if metrics.get("pteBytes") is None:
        from stylify_ml.export import export_pte  # ExecuTorch is only installed where models are exported

        model, _ = load_checkpoint(run / "best.pt")
        with tempfile.TemporaryDirectory() as tmp:
            metrics["pteBytes"] = export_pte(model, Path(tmp) / "classifier.pte")
        (run / "metrics.json").write_text(json.dumps(metrics, indent=2) + "\n")
    return metrics["pteBytes"]


def _fmt(value: float | None) -> str:
    return "-" if value is None else f"{value:.3f}"


def compare(data: Path) -> str:
    header = ("run", "model", "val bacc", "users top1", "users top3", "personal top1", "personal top3",
              "threshold", ".pte MB")
    rows = [header]
    for metrics_path in sorted(Path(data).glob("runs/*/metrics.json")):
        run = metrics_path.parent
        metrics = json.loads(metrics_path.read_text())
        config_path = run / "config.json"
        model = json.loads(config_path.read_text())["model_name"] if config_path.exists() else "?"
        personal = metrics["personal"]
        users = metrics.get("users")
        rows.append((
            run.name,
            model,
            _fmt(metrics["val"]["balanced_accuracy"]),
            _fmt(users["top1"] if users else None),
            _fmt(users["top3"] if users else None),
            _fmt(personal["top1"] if personal else None),
            _fmt(personal["top3"] if personal else None),
            _fmt(metrics["threshold"]),
            f"{_pte_bytes(run, metrics) / 1e6:.1f}",
        ))
    widths = [max(len(r[i]) for r in rows) for i in range(len(header))]
    return "\n".join("  ".join(cell.ljust(w) for cell, w in zip(r, widths)).rstrip() for r in rows)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, required=True)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--run", type=Path, help="run directory to evaluate")
    mode.add_argument("--compare", action="store_true", help="print a table of every evaluated run")
    parser.add_argument("--device", default=None, help="default: cuda, else mps, else cpu")
    args = parser.parse_args(argv)
    if args.compare:
        print(compare(args.data))
    else:
        m = evaluate(args.run, args.data, args.device)
        personal, users = m["personal"], m["users"]
        print(f"val balanced accuracy {m['val']['balanced_accuracy']:.4f}, threshold {m['threshold']:.4f}, "
              f"users top-1 {_fmt(users['top1'] if users else None)}, "
              f"personal top-1 {_fmt(personal['top1'] if personal else None)}")


if __name__ == "__main__":
    main()
