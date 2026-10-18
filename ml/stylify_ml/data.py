"""Datasets, transforms and personal-photo loading. All images end as a stretched 224x224."""

from __future__ import annotations

from pathlib import Path
from typing import Callable

import pillow_heif
import torch
from PIL import Image, ImageOps
from torch.utils.data import Dataset, WeightedRandomSampler
from torchvision import transforms as T

from .labels import LABELS, label_index
from .manifest import Row, read_manifest

pillow_heif.register_heif_opener()

MEAN = [0.485, 0.456, 0.406]
STD = [0.229, 0.224, 0.225]
_EXTS = {".jpg", ".jpeg", ".png", ".heic"}


def load_image(path: Path) -> Image.Image:
    with Image.open(path) as img:
        return ImageOps.exif_transpose(img).convert("RGB")


def eval_transform() -> Callable[[Image.Image], torch.Tensor]:
    return T.Compose([T.Resize((224, 224)), T.ToTensor(), T.Normalize(MEAN, STD)])


def train_transform() -> Callable[[Image.Image], torch.Tensor]:
    return T.Compose([
        T.Resize((256, 256)),  # stretch first, as the app does, so the crop sees the whole item
        T.RandomResizedCrop(256, scale=(0.6, 1.0)),
        T.RandomHorizontalFlip(),
        T.ColorJitter(0.2, 0.2, 0.1),
        eval_transform(),
    ])


class ManifestDataset(Dataset):
    def __init__(self, data: Path, split: str, transform: Callable[[Image.Image], torch.Tensor]):
        self.data = Path(data)
        self.transform = transform
        self.rows: list[Row] = [r for r in read_manifest(self.data / "manifest.csv") if r.split == split]

    def __len__(self) -> int:
        return len(self.rows)

    def __getitem__(self, i: int) -> tuple[torch.Tensor, int]:
        row = self.rows[i]
        return self.transform(load_image(self.data / row.path)), label_index(row.label)


def balanced_sampler(dataset: ManifestDataset) -> WeightedRandomSampler:
    counts: dict[str, int] = {}
    for r in dataset.rows:
        counts[r.label] = counts.get(r.label, 0) + 1
    weights = [1.0 / counts[r.label] for r in dataset.rows]
    return WeightedRandomSampler(weights, num_samples=len(dataset), replacement=True)


def load_personal(data: Path) -> list[tuple[Path, int]]:
    root = Path(data) / "personal"
    if not root.is_dir():
        return []
    items: list[tuple[Path, int]] = []
    for folder in sorted(root.iterdir()):
        if folder.name.startswith(".") or not folder.is_dir():
            continue
        if folder.name not in LABELS:
            raise ValueError(f"personal/{folder.name} is not a label; expected one of {list(LABELS)}")
        idx = label_index(folder.name)
        for f in sorted(folder.iterdir()):
            if not f.name.startswith(".") and f.is_file() and f.suffix.lower() in _EXTS:
                items.append((f, idx))
    return items
