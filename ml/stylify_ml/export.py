"""Export a classifier to ExecuTorch (.pte) with a parity check, plus its metadata file."""

import argparse
import json
import random
import shutil
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import torch
from executorch.backends.xnnpack.partition.xnnpack_partitioner import XnnpackPartitioner
from executorch.exir import to_edge_transform_and_lower
from executorch.runtime import Runtime

from stylify_ml.data import MEAN, STD, ManifestDataset, eval_transform, load_image
from stylify_ml.labels import LABELS, label_index
from stylify_ml.metrics import summarise
from stylify_ml.models import build_model, load_checkpoint

INPUT_SIZE = 224
INT8_MAX_TOP1_DROP = 0.01  # int8 ships only if its users and Carousell top-1 are each within this of float's
INT8_MIN_AGREEMENT = 0.9  # share of val crops where int8 and PyTorch agree on top-1


class ParityError(Exception):
    """The .pte output differs from the PyTorch model beyond tolerance."""


def _quantize(model: torch.nn.Module, example: tuple, calibration: torch.Tensor) -> torch.nn.Module:
    """Post-training int8 (PT2E, XNNPACK's symmetric per-channel config), calibrated one sample at a time."""
    from executorch.backends.xnnpack.quantizer.xnnpack_quantizer import (
        XNNPACKQuantizer,
        get_symmetric_quantization_config,
    )
    from torchao.quantization.pt2e.quantize_pt2e import convert_pt2e, prepare_pt2e

    quantizer = XNNPACKQuantizer().set_global(get_symmetric_quantization_config(is_per_channel=True))
    captured = torch.export.export(model, example).module()
    prepared = prepare_pt2e(captured, quantizer)
    with torch.no_grad():
        for sample in calibration:
            prepared(sample.unsqueeze(0))
    return convert_pt2e(prepared)


def export_pte(model: torch.nn.Module, out_path: Path, quantize: bool = False,
               calibration: torch.Tensor | None = None) -> int:
    """Lower to a .pte with XNNPACK; with `quantize`, int8 calibrated on `calibration` ([N, 3, 224, 224]).

    Input and output stay float32 either way, so the app does not change."""
    model = model.eval()
    example = (torch.rand(1, 3, INPUT_SIZE, INPUT_SIZE),)
    if quantize:
        if calibration is None or not len(calibration):
            raise ValueError("int8 export needs calibration inputs")
        model = _quantize(model, example, calibration)
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


def check_top1_agreement(pte_path: Path, model: torch.nn.Module, inputs: torch.Tensor, min_agreement: float) -> float:
    """Share of inputs where the .pte and PyTorch pick the same top-1; ParityError below `min_agreement`."""
    method = Runtime.get().load_program(str(pte_path)).load_method("forward")
    model = model.eval()
    agree = 0
    for sample in inputs:
        x = sample.unsqueeze(0).contiguous()
        with torch.no_grad():
            expected = model(x).argmax(dim=1).item()
        agree += int(method.execute([x])[0].argmax(dim=1).item() == expected)
    share = agree / len(inputs)
    if share < min_agreement:
        raise ParityError(f"top-1 agrees on {share:.2f} of inputs, below {min_agreement:.2f}")
    return share


def score_pte(pte_path: Path, data: Path, half: str) -> dict | None:
    """Score a .pte on one held-out half ("users" or "carousell") through the ExecuTorch runtime."""
    from stylify_ml.evaluate import _half  # evaluate does not import ExecuTorch, so no cycle at import time

    method = Runtime.get().load_program(str(pte_path)).load_method("forward")
    rows = [r for r in ManifestDataset(data, "test", eval_transform()).rows if _half(r) == half]
    if not rows:
        return None
    transform = eval_transform()
    probs, targets = [], []
    for row in rows:
        x = transform(load_image(Path(data) / row.path)).unsqueeze(0).contiguous()
        probs.append(torch.softmax(method.execute([x])[0][0], 0).numpy())
        targets.append(label_index(row.label))
    return summarise(np.stack(probs), np.array(targets))


def write_metadata(out_dir: Path, *, threshold: float, model: str, run: str | None,
                   scores: dict, quantized: str | None = None) -> dict:
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
        "quantized": quantized,
    }
    (Path(out_dir) / "classifier.json").write_text(json.dumps(meta, indent=2) + "\n")
    return meta


def _export_to(out_dir: Path, model: torch.nn.Module, inputs: torch.Tensor, *, threshold: float,
               name: str, run: str | None, scores: dict, int8_from: Path | None = None) -> int:
    """Export and check parity in a temp dir; move classifier.pte and classifier.json to out_dir only on success.

    With `int8_from`, that already-checked int8 .pte is used instead of a fresh float export."""
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        if int8_from is None:
            size = export_pte(model, tmp / "classifier.pte")
            worst = check_parity(tmp / "classifier.pte", model, inputs)
        else:
            shutil.copyfile(int8_from, tmp / "classifier.pte")
            size = (tmp / "classifier.pte").stat().st_size
            worst = float("nan")
        write_metadata(tmp, threshold=threshold, model=name, run=run, scores=scores,
                       quantized="int8" if int8_from is not None else None)
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
               run=None, scores={"valBalancedAccuracy": None, "personalTop1": None, "personalTop3": None,
                                 "usersTop1": None, "usersTop3": None, "carousellTop1": None,
                                 "carousellTop3": None})


def _run_data(run: Path, data: Path | None) -> Path:
    """The --data folder for a run: given, else as recorded in config.json, else the folder holding runs/.

    A run trained elsewhere (Kaggle) records a path that does not exist here.
    """
    if data is not None:
        return Path(data)
    recorded = Path(json.loads((run / "config.json").read_text())["data"])
    return recorded if (recorded / "manifest.csv").exists() else run.parent.parent


def _calibration(data: Path, size: int) -> torch.Tensor:
    """`size` train crops, labels taken in turn after a seeded shuffle, so every label is represented."""
    rows = ManifestDataset(data, "train", eval_transform())
    by_label: dict[str, list[int]] = {}
    for i, r in enumerate(rows.rows):
        by_label.setdefault(r.label, []).append(i)
    rng = random.Random(0)
    for indices in by_label.values():
        rng.shuffle(indices)
    picked, queues = [], [by_label[l] for l in sorted(by_label)]
    while len(picked) < size and any(queues):
        for q in queues:
            if q and len(picked) < size:
                picked.append(q.pop())
    return torch.stack([rows[i][0] for i in picked])


def _int8_or_exit(model: torch.nn.Module, data: Path, inputs: torch.Tensor, calibration_size: int,
                  work: Path) -> Path:
    """Export float and int8 to `work`, score both on users and Carousell, and return the int8 .pte if each
    top-1 is within INT8_MAX_TOP1_DROP of float's; otherwise print the numbers and exit non-zero."""
    float_pte, int8_pte = work / "float.pte", work / "int8.pte"
    print(f"float .pte {export_pte(model, float_pte) / 1e6:.1f} MB", flush=True)
    calibration = _calibration(data, calibration_size)
    print(f"int8 .pte {export_pte(model, int8_pte, quantize=True, calibration=calibration) / 1e6:.1f} MB", flush=True)
    agreement = check_top1_agreement(int8_pte, model, inputs, INT8_MIN_AGREEMENT)
    print(f"int8 top-1 agrees with PyTorch on {agreement:.2f} of {len(inputs)} val crops", flush=True)
    ok = True
    for half in ("users", "carousell"):
        f, q = score_pte(float_pte, data, half), score_pte(int8_pte, data, half)
        if f is None:
            continue
        print(f"{half}: float top-1 {f['top1']:.4f}, int8 top-1 {q['top1']:.4f}", flush=True)
        ok = ok and f["top1"] - q["top1"] <= INT8_MAX_TOP1_DROP
    if not ok:
        print(f"int8 loses more than {INT8_MAX_TOP1_DROP} top-1; nothing written. Export float instead.", flush=True)
        sys.exit(1)
    return int8_pte


def _export_run(run: Path, out_dir: Path, data: Path | None = None, int8: bool = False,
                calibration_size: int = 256) -> None:
    run = Path(run)
    model, meta = load_checkpoint(run / "best.pt")
    if meta["labels"] != list(LABELS):
        raise ValueError(f"checkpoint labels {meta['labels']} differ from the current LABELS {list(LABELS)}")
    metrics = json.loads((run / "metrics.json").read_text())
    data = _run_data(run, data)
    val = ManifestDataset(data, "val", eval_transform())
    if not len(val):
        raise ValueError(f"no val rows in {data / 'manifest.csv'} for the parity check")
    inputs = torch.stack([val[i][0] for i in range(min(64 if int8 else 16, len(val)))])
    personal = metrics["personal"]
    users = metrics.get("users")  # absent in runs evaluated before the clothing dataset
    scores = {
        "valBalancedAccuracy": metrics["val"]["balanced_accuracy"],
        "personalTop1": personal["top1"] if personal else None,
        "personalTop3": personal["top3"] if personal else None,
        "usersTop1": users["top1"] if users else None,
        "usersTop3": users["top3"] if users else None,
        "carousellTop1": metrics["carousell"]["top1"] if metrics.get("carousell") else None,
        "carousellTop3": metrics["carousell"]["top3"] if metrics.get("carousell") else None,
    }
    with tempfile.TemporaryDirectory() as work:
        int8_pte = _int8_or_exit(model, data, inputs, calibration_size, Path(work)) if int8 else None
        _export_to(out_dir, model, inputs, threshold=metrics["threshold"], name=meta["model"],
                   run=run.name, scores=scores, int8_from=int8_pte)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--run", type=Path, help="run directory holding best.pt and metrics.json")
    mode.add_argument("--placeholder", action="store_true", help="export an untrained model that always abstains")
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--data", type=Path, default=None,
                        help="data folder for the parity crops; default: the run's recorded one, else ../..")
    parser.add_argument("--int8", action="store_true",
                        help="ship int8 if it keeps users and Carousell top-1 within 0.01 of float, else exit 1")
    parser.add_argument("--calibration-size", type=int, default=256, help="train crops used to calibrate int8")
    args = parser.parse_args(argv)
    if args.placeholder:
        _export_placeholder(args.out)
    else:
        _export_run(args.run, args.out, args.data, int8=args.int8, calibration_size=args.calibration_size)


if __name__ == "__main__":
    main()
