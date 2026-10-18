"""Train a classifier in two phases: the new head alone, then the whole network."""

from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import torch
from torch.utils.data import DataLoader

from stylify_ml.data import ManifestDataset, balanced_sampler, eval_transform, train_transform
from stylify_ml.metrics import balanced_accuracy
from stylify_ml.models import MODEL_NAMES, build_model, head_parameters, save_checkpoint


def default_device() -> str:
    return "mps" if torch.backends.mps.is_available() else "cpu"


def _train_epoch(model, loader, loss_fn, optimiser, device) -> float:
    model.train()
    total, count = 0.0, 0
    for x, y in loader:
        x, y = x.to(device), y.to(device)
        optimiser.zero_grad()
        loss = loss_fn(model(x), y)
        loss.backward()
        optimiser.step()
        total += loss.item() * len(y)
        count += len(y)
    return total / count if count else 0.0


def predict(model, loader, device) -> tuple[np.ndarray, np.ndarray]:
    """Softmax probabilities and targets for every batch of `loader`."""
    model.eval()
    probs, targets = [], []
    with torch.no_grad():
        for x, y in loader:
            probs.append(torch.softmax(model(x.to(device)), dim=1).cpu().numpy())
            targets.append(np.asarray(y))
    if not probs:
        return np.zeros((0, 0)), np.zeros(0, dtype=int)
    return np.concatenate(probs), np.concatenate(targets)


def train(data: Path, model_name: str, head_epochs: int = 3, head_lr: float = 1e-3,
          full_epochs: int = 12, full_lr: float = 1e-4, batch_size: int = 64,
          label_smoothing: float = 0.1, pretrained: bool = True, device: str | None = None,
          run_id: str | None = None, workers: int = 4) -> Path:
    """Train `model_name` on `data/manifest.csv` and return the run directory `data/runs/<run_id>/`."""
    data = Path(data).resolve()
    device = device or default_device()
    run_id = run_id or f"{datetime.now(timezone.utc):%Y%m%d-%H%M%S}-{model_name}"
    run = data / "runs" / run_id
    run.mkdir(parents=True, exist_ok=False)  # never overwrite a run

    config = {
        "data": str(data), "model_name": model_name, "head_epochs": head_epochs, "head_lr": head_lr,
        "full_epochs": full_epochs, "full_lr": full_lr, "batch_size": batch_size,
        "label_smoothing": label_smoothing, "pretrained": pretrained, "device": device,
        "run_id": run_id, "workers": workers,
    }
    (run / "config.json").write_text(json.dumps(config, indent=2) + "\n")

    train_ds = ManifestDataset(data, "train", train_transform())
    val_ds = ManifestDataset(data, "val", eval_transform())
    if not len(train_ds) or not len(val_ds):
        raise ValueError(f"manifest needs train and val rows (train={len(train_ds)}, val={len(val_ds)})")
    # drop_last avoids a final batch of one, which BatchNorm in train mode rejects.
    train_loader = DataLoader(train_ds, batch_size=batch_size, sampler=balanced_sampler(train_ds),
                              num_workers=workers, drop_last=len(train_ds) > batch_size)
    val_loader = DataLoader(val_ds, batch_size=batch_size, num_workers=workers)

    model = build_model(model_name, pretrained=pretrained).to(device)
    loss_fn = torch.nn.CrossEntropyLoss(label_smoothing=label_smoothing)
    best = None

    with (run / "epochs.jsonl").open("w") as log:
        for phase, epochs, lr in (("head", head_epochs, head_lr), ("full", full_epochs, full_lr)):
            if phase == "head":
                for p in model.parameters():
                    p.requires_grad = False
                for p in head_parameters(model, model_name):
                    p.requires_grad = True
            else:
                for p in model.parameters():
                    p.requires_grad = True
            params = [p for p in model.parameters() if p.requires_grad]
            optimiser = torch.optim.AdamW(params, lr=lr)
            scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimiser, T_max=max(epochs, 1))
            for epoch in range(1, epochs + 1):
                train_loss = _train_epoch(model, train_loader, loss_fn, optimiser, device)
                scheduler.step()
                probs, targets = predict(model, val_loader, device)
                val_bacc = balanced_accuracy(probs, targets)
                log.write(json.dumps({"phase": phase, "epoch": epoch, "train_loss": train_loss,
                                      "val_balanced_accuracy": val_bacc}) + "\n")
                log.flush()
                print(f"{phase} {epoch}/{epochs} loss {train_loss:.4f} val bacc {val_bacc:.4f}", flush=True)
                if best is None or val_bacc > best:
                    best = val_bacc
                    save_checkpoint(run / "best.pt", model, model_name,
                                    {"val_balanced_accuracy": val_bacc, "phase": phase, "epoch": epoch})
    return run


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--model", choices=MODEL_NAMES, required=True)
    parser.add_argument("--head-epochs", type=int, default=3)
    parser.add_argument("--head-lr", type=float, default=1e-3)
    parser.add_argument("--full-epochs", type=int, default=12)
    parser.add_argument("--full-lr", type=float, default=1e-4)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--label-smoothing", type=float, default=0.1)
    parser.add_argument("--no-pretrained", action="store_true")
    parser.add_argument("--device", default=None, help="default: mps if available, else cpu")
    parser.add_argument("--run-id", default=None)
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args(argv)
    run = train(args.data, args.model, head_epochs=args.head_epochs, head_lr=args.head_lr,
                full_epochs=args.full_epochs, full_lr=args.full_lr, batch_size=args.batch_size,
                label_smoothing=args.label_smoothing, pretrained=not args.no_pretrained,
                device=args.device, run_id=args.run_id, workers=args.workers)
    print(run)


if __name__ == "__main__":
    main()
