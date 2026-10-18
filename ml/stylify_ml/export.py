"""Export a classifier to ExecuTorch (.pte) with a parity check, plus its metadata file."""

import argparse
import json
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import torch
from executorch.backends.xnnpack.partition.xnnpack_partitioner import XnnpackPartitioner
from executorch.exir import to_edge_transform_and_lower
from executorch.runtime import Runtime

from stylify_ml.data import MEAN, STD, ManifestDataset, eval_transform
from stylify_ml.labels import LABELS
from stylify_ml.models import build_model, load_checkpoint

INPUT_SIZE = 224


class ParityError(Exception):
    """The .pte output differs from the PyTorch model beyond tolerance."""


def export_pte(model: torch.nn.Module, out_path: Path) -> int:
    model = model.eval()
    example = (torch.rand(1, 3, INPUT_SIZE, INPUT_SIZE),)
    with torch.no_grad():
        exported = torch.export.export(model, example)
    program = to_edge_transform_and_lower(exported, partitioner=[XnnpackPartitioner()]).to_executorch()
    data = program.buffer
    Path(out_path).write_bytes(data)
    return len(data)


def check_parity(pte_path: Path, model: torch.nn.Module, inputs: torch.Tensor, tol: float = 1e-3) -> float:
    """Max abs logit difference between the .pte and PyTorch, one sample at a time."""
    method = Runtime.get().load_program(str(pte_path)).load_method("forward")
    model = model.eval()
    worst = 0.0
    for sample in inputs:
        x = sample.unsqueeze(0).contiguous()
        with torch.no_grad():
            expected = model(x)
        actual = method.execute([x])[0]
        if tuple(actual.shape) != tuple(expected.shape):
            raise ParityError(f"output shape {tuple(actual.shape)} differs from {tuple(expected.shape)}")
        worst = max(worst, (actual - expected).abs().max().item())
    if worst > tol:
        raise ParityError(f"max abs logit difference {worst:.2e} exceeds {tol:.0e}")
    return worst


def write_metadata(out_dir: Path, *, threshold: float, model: str, run: str | None,
                   scores: dict) -> dict:
    meta = {
        "labels": list(LABELS),
        "inputSize": INPUT_SIZE,
        "resizeMode": "stretch",
        "normalize": {"mean": MEAN, "std": STD},
        "threshold": threshold,
        "model": model,
        "run": run,
        "exportedAt": datetime.now(timezone.utc).isoformat(),
        "scores": scores,
    }
    (Path(out_dir) / "classifier.json").write_text(json.dumps(meta, indent=2) + "\n")
    return meta


def _export_to(out_dir: Path, model: torch.nn.Module, inputs: torch.Tensor, *, threshold: float,
               name: str, run: str | None, scores: dict) -> int:
    """Export and check parity in a temp dir; move classifier.pte and classifier.json to out_dir only on success."""
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        size = export_pte(model, tmp / "classifier.pte")
        worst = check_parity(tmp / "classifier.pte", model, inputs)
        write_metadata(tmp, threshold=threshold, model=name, run=run, scores=scores)
        out_dir = Path(out_dir)
        out_dir.mkdir(parents=True, exist_ok=True)
        for f in ("classifier.pte", "classifier.json"):
            shutil.move(tmp / f, out_dir / f)
    print(f"wrote {out_dir / 'classifier.pte'} ({size} bytes, max logit diff {worst:.2e})")
    return size


def _export_placeholder(out_dir: Path) -> None:
    model = build_model("mobilenet_v3_large", pretrained=False)
    last = model.classifier[3]
    torch.nn.init.zeros_(last.weight)
    torch.nn.init.zeros_(last.bias)
    _export_to(out_dir, model, torch.rand(2, 3, INPUT_SIZE, INPUT_SIZE), threshold=1.0, name="placeholder",
               run=None, scores={"valBalancedAccuracy": None, "personalTop1": None, "personalTop3": None})


def _export_run(run: Path, out_dir: Path) -> None:
    run = Path(run)
    model, meta = load_checkpoint(run / "best.pt")
    if meta["labels"] != list(LABELS):
        raise ValueError(f"checkpoint labels {meta['labels']} differ from the current LABELS {list(LABELS)}")
    metrics = json.loads((run / "metrics.json").read_text())
    data = Path(json.loads((run / "config.json").read_text())["data"])
    val = ManifestDataset(data, "val", eval_transform())
    if not len(val):
        raise ValueError(f"no val rows in {data / 'manifest.csv'} for the parity check")
    inputs = torch.stack([val[i][0] for i in range(min(16, len(val)))])
    personal = metrics["personal"]
    scores = {
        "valBalancedAccuracy": metrics["val"]["balanced_accuracy"],
        "personalTop1": personal["top1"] if personal else None,
        "personalTop3": personal["top3"] if personal else None,
    }
    _export_to(out_dir, model, inputs, threshold=metrics["threshold"], name=meta["model"],
               run=run.name, scores=scores)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--run", type=Path, help="run directory holding best.pt and metrics.json")
    mode.add_argument("--placeholder", action="store_true", help="export an untrained model that always abstains")
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args(argv)
    if args.placeholder:
        _export_placeholder(args.out)
    else:
        _export_run(args.run, args.out)


if __name__ == "__main__":
    main()
