"""Append the Carousell marketplace photos to an existing crop cache and manifest.csv.

The photos are used whole, like the clothing dataset. Near-duplicates (the same listing shot twice) share a
group, and the split is by group, so one listing never sits on both sides. Running it again replaces the
earlier Carousell rows and files and leaves every other row alone.
"""

from __future__ import annotations

import argparse
import hashlib
import shutil
from collections import Counter
from pathlib import Path

import numpy as np

from .manifest import Row, read_manifest, write_manifest
from .prepare import _open_rgb, _print_table, _Pending, _write_crops, dhash, read_overrides

CAROUSELL_CLASS_TO_LABEL: dict[str, str | None] = {
    "Kaos": "top", "Kemeja": "top", "Polo": "top", "Sweter": "top",
    "Blazer": "outerwear", "Jaket": "outerwear", "Jaket_Denim": "outerwear", "Jaket_Olahraga": "outerwear",
    "Mantel": "outerwear",
    "Celana_Panjang": "trousers", "Jeans": "trousers",
    "Celana_Pendek": "shorts",
    "Rok": "skirt",
    "Gaun": "dress",
    "Hoodie": None,  # pullover (top) and zip-up (outerwear) are mixed; top/outerwear is already the worst confusion
}
OVERRIDES = Path(__file__).with_name("carousell_overrides.csv")
SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}
TRAIN_FRACTION, VAL_FRACTION = 0.60, 0.10  # the rest is test
SUMMARY_KEYS = ("crops", "skipped_hoodie", "skipped_override", "skipped_unreadable", "skipped_small",
                "skipped_duplicate")


def carousell_split(group: str) -> str:
    """Stable train/val/test (about 60/10/30) from a sha256 of the group."""
    digest = hashlib.sha256(f"carousell:{group}".encode()).digest()
    position = int.from_bytes(digest[:8], "big") / 2**64
    if position < TRAIN_FRACTION:
        return "train"
    return "val" if position < TRAIN_FRACTION + VAL_FRACTION else "test"


def near_duplicate_groups(hashes: list[str], max_distance: int = 6) -> list[str]:
    """For each 64-bit hex hash, the smallest hash in its cluster (Hamming distance <= max_distance, transitive)."""
    n = len(hashes)
    parent = list(range(n))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    if n:
        bits = np.unpackbits(np.array([int(h, 16) for h in hashes], dtype=">u8").view(np.uint8).reshape(n, 8), axis=1)
        for start in range(0, n, 512):
            block = bits[start:start + 512]
            distance = (block[:, None, :] != bits[None, :, :]).sum(axis=2)
            for a, b in zip(*np.nonzero(distance <= max_distance)):
                i, j = start + int(a), int(b)
                if i < j:
                    parent[find(j)] = find(i)
    smallest: dict[int, str] = {}
    for i, h in enumerate(hashes):
        root = find(i)
        smallest[root] = min(smallest.get(root, h), h)
    return [smallest[find(i)] for i in range(n)]


def _collect(data: Path, min_side: int, counts: Counter) -> list[tuple[Path, str, str, tuple[int, int]]]:
    """(image, label, dhash, size) for every usable photo, exact duplicates removed (first in sorted order wins)."""
    base = data / "raw" / "carousell" / "Clothes_Dataset"
    if not base.is_dir():
        raise ValueError(f"missing {base}; see docs/ml.md")
    overrides = read_overrides(OVERRIDES)
    folders = [f for f in sorted(base.iterdir()) if f.is_dir() and not f.name.startswith(".")]
    unknown = [f.name for f in folders if f.name not in CAROUSELL_CLASS_TO_LABEL]
    if unknown:
        raise ValueError(f"unknown Carousell classes {unknown}; add them to CAROUSELL_CLASS_TO_LABEL")
    found: list[tuple[Path, str, str, tuple[int, int]]] = []
    seen: set[str] = set()
    for folder in folders:
        for path in sorted(p for p in folder.iterdir() if p.is_file()):
            if path.name.startswith(".") or path.suffix.lower() not in SUFFIXES:
                continue
            key = f"{folder.name}/{path.name}"
            label = overrides.get(key, CAROUSELL_CLASS_TO_LABEL[folder.name])
            if label is None:
                counts["skipped_hoodie"] += 1
                continue
            if label == "drop":
                counts["skipped_override"] += 1
                continue
            image = _open_rgb(path)
            if image is None:
                counts["skipped_unreadable"] += 1
                continue
            if min(image.size) < min_side:
                counts["skipped_small"] += 1
                continue
            digest = dhash(image)
            if digest in seen:
                counts["skipped_duplicate"] += 1
                continue
            seen.add(digest)
            found.append((path, label, digest, image.size))
    return found


def append_carousell(data: Path, min_side: int = 64) -> dict[str, int]:
    data = Path(data)
    counts: Counter = Counter()
    found = _collect(data, min_side, counts)
    groups = near_duplicate_groups([digest for _, _, digest, _ in found])

    backup = data / "manifest-pre-carousell.csv"
    if not backup.exists():
        shutil.copyfile(data / "manifest.csv", backup)
    others = [r for r in read_manifest(data / "manifest.csv") if r.source != "carousell"]
    for old in (data / "crops").glob("*/carousell-*.jpg"):
        old.unlink()

    pending = []
    for (path, label, digest, size), group in zip(found, groups):
        split = carousell_split(group)
        row = Row(path=f"crops/{label}/carousell-{split}-{digest}.jpg", label=label, source="carousell",
                  split=split, group=f"carousell:{group}", origin="user")
        pending.append(_Pending(row, path, (0, 0, *size)))
    written = _write_crops(data, pending, counts)
    rows = sorted((p.row for p in written), key=lambda r: r.path)
    write_manifest(data / "manifest.csv", others + rows)
    counts["crops"] = len(rows)
    _print_table(rows)
    return {key: counts[key] for key in SUMMARY_KEYS}


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, required=True)
    args = parser.parse_args(argv)
    for key, value in append_carousell(args.data).items():
        print(f"{key}: {value}")


if __name__ == "__main__":
    main()
