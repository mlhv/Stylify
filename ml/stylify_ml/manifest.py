"""Manifest rows and CSV I/O, plus the stable train/val split and per-label capping."""

from __future__ import annotations

import csv
import hashlib
import random
import re
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path

FIELDS = ("path", "label", "source", "split", "group", "origin")
_ITEM_ID = re.compile(r"id_\d{8}")


@dataclass(frozen=True)
class Row:
    path: str
    label: str
    source: str   # "df2" | "mm" | "web" | "clothing"
    split: str    # "train" | "val" | "test" (test: the held-out half of the clothing dataset)
    group: str
    origin: str   # "shop" | "user" | "studio" | "web"  (clothing rows are "user")


def write_manifest(path: Path, rows: list[Row]) -> None:
    with path.open("w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        writer.writeheader()
        for row in rows:
            writer.writerow(vars(row))


def read_manifest(path: Path) -> list[Row]:
    with path.open(newline="") as f:
        return [Row(**record) for record in csv.DictReader(f)]


def mm_item_id(filename: str) -> str:
    match = _ITEM_ID.search(filename)
    if match is None:
        raise ValueError(f"no id_XXXXXXXX item id in {filename!r}")
    return match.group(0)


def mm_split(item_id: str, val_fraction: float = 0.15) -> str:
    """Stable split from a sha256 of the item id. Python's hash() is salted per process, so it is not used."""
    digest = hashlib.sha256(item_id.encode()).digest()
    position = int.from_bytes(digest[:8], "big") / 2**64  # uniform in [0, 1)
    return "val" if position < val_fraction else "train"


def cap_per_label(rows: list[Row], cap: int, labels: set[str], seed: int = 0) -> list[Row]:
    """Keep at most `cap` train rows for each label in `labels`, chosen with a seeded RNG.

    Other rows are kept as they are, and the original order is preserved.
    """
    rng = random.Random(seed)
    by_label: dict[str, list[int]] = defaultdict(list)
    for index, row in enumerate(rows):
        if row.split == "train" and row.label in labels:
            by_label[row.label].append(index)

    dropped: set[int] = set()
    for label in sorted(by_label):
        indices = by_label[label]
        if len(indices) > cap:
            keep = set(rng.sample(indices, cap))
            dropped.update(i for i in indices if i not in keep)

    return [row for index, row in enumerate(rows) if index not in dropped]
