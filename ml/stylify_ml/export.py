"""Export a classifier to ExecuTorch (.pte) with a parity check, plus its metadata file."""

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import torch
from executorch.backends.xnnpack.partition.xnnpack_partitioner import XnnpackPartitioner
from executorch.exir import to_edge_transform_and_lower
from executorch.runtime import Runtime

from stylify_ml.labels import LABELS
from stylify_ml.models import build_model

INPUT_SIZE = 224
MEAN = [0.485, 0.456, 0.406]
STD = [0.229, 0.224, 0.225]


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


def _export_placeholder(out_dir: Path) -> None:
    model = build_model("mobilenet_v3_large", pretrained=False)
    last = model.classifier[3]
    torch.nn.init.zeros_(last.weight)
    torch.nn.init.zeros_(last.bias)
    out_dir.mkdir(parents=True, exist_ok=True)
    size = export_pte(model, out_dir / "classifier.pte")
    check_parity(out_dir / "classifier.pte", model, torch.rand(2, 3, INPUT_SIZE, INPUT_SIZE))
    write_metadata(out_dir, threshold=1.0, model="placeholder", run=None,
                   scores={"valBalancedAccuracy": None, "personalTop1": None, "personalTop3": None})
    print(f"wrote {out_dir / 'classifier.pte'} ({size} bytes)")


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
        raise NotImplementedError("--run arrives with evaluate (Task 7)")


if __name__ == "__main__":
    main()
