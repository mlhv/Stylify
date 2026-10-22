"""Build the crop cache and manifest.csv from raw DeepFashion2, DeepFashion-MultiModal and web product photos."""

from __future__ import annotations

import argparse
import json
import shutil
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image

from .boxes import Box, mask_box, short_side, widen
from .labels import DF2_CATEGORY_TO_LABEL, LABELS, MM_CLASS_TO_LABEL
from .manifest import Row, cap_per_label, mm_item_id, mm_split, write_manifest

GARMENT_LABELS = {"top", "outerwear", "trousers", "shorts", "skirt", "dress"}
ACCESSORY_LABELS = {"shoes", "hat", "bag"}
LONG_SIDE = 256
JPEG_QUALITY = 90
WEB_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}
BAG_MIN_ASPECT = 0.4  # bag crops narrower than this sit at the frame edge and are mostly arm and torso
SUMMARY_KEYS = (
    "crops", "skipped_occluded", "skipped_small", "skipped_degenerate",
    "skipped_sliver", "skipped_duplicate", "skipped_unreadable", "skipped_missing", "skipped_unknown_category", "dropped_by_cap",
)


@dataclass(frozen=True)
class _Pending:
    row: Row
    image: Path
    box: Box  # already widened


def _open_rgb(path: Path) -> Image.Image | None:
    try:
        with Image.open(path) as img:
            return img.convert("RGB")
    except Exception:
        return None


def _collect_df2(data: Path, min_side: int, counts: Counter) -> list[_Pending]:
    pending: list[_Pending] = []
    for dir_name, split in (("train", "train"), ("validation", "val")):
        base = data / "raw" / "deepfashion2" / dir_name
        for anno_path in sorted((base / "annos").glob("*.json")):
            stem = anno_path.stem
            image_path = base / "image" / f"{stem}.jpg"
            try:
                anno = json.loads(anno_path.read_text())
                origin = str(anno["source"])
                group = f"df2:{split}:{anno['pair_id']}"
                items = [(k, v) for k, v in sorted(anno.items()) if k.startswith("item") and isinstance(v, dict)]
            except Exception:
                counts["skipped_unreadable"] += 1
                continue
            if not image_path.exists():
                counts["skipped_missing"] += 1
                continue
            image = _open_rgb(image_path)
            if image is None:
                counts["skipped_unreadable"] += 1
                continue
            width, height = image.size
            for key, item in items:
                if item.get("occlusion") == 3:
                    counts["skipped_occluded"] += 1
                    continue
                label = DF2_CATEGORY_TO_LABEL.get(item.get("category_id"))
                if label is None:
                    counts["skipped_unknown_category"] += 1
                    continue
                x1, y1, x2, y2 = (int(v) for v in item["bounding_box"])
                box = (max(0, x1), max(0, y1), min(width, x2), min(height, y2))
                if box[2] <= box[0] or box[3] <= box[1]:
                    counts["skipped_degenerate"] += 1
                    continue
                if short_side(box) < min_side:
                    counts["skipped_small"] += 1
                    continue
                k = key.removeprefix("item")
                row = Row(
                    path=f"crops/{label}/df2-{split}-{stem}-{k}.jpg",
                    label=label, source="df2", split=split, group=group, origin=origin,
                )
                pending.append(_Pending(row, image_path, widen(box, width, height)))
    return pending


def _collect_mm(data: Path, min_side: int, counts: Counter) -> list[_Pending]:
    pending: list[_Pending] = []
    base = data / "raw" / "multimodal"
    for mask_path in sorted((base / "parsing").glob("*_segm.png")):
        stem = mask_path.name.removesuffix("_segm.png")
        image_path = base / "images" / f"{stem}.jpg"
        try:
            item_id = mm_item_id(stem)
        except ValueError:
            counts["skipped_unreadable"] += 1
            continue
        if not image_path.exists():
            counts["skipped_missing"] += 1
            continue
        image = _open_rgb(image_path)
        if image is None:
            counts["skipped_unreadable"] += 1
            continue
        try:
            with Image.open(mask_path) as m:
                m.load()
                if m.size != image.size:
                    m = m.resize(image.size, Image.NEAREST)
                mask = np.array(m)
        except Exception:
            counts["skipped_unreadable"] += 1
            continue
        if mask.ndim == 3:
            mask = mask[..., 0]
        width, height = image.size
        split = mm_split(item_id)
        for class_id, label in sorted(MM_CLASS_TO_LABEL.items()):
            box = mask_box(mask, class_id)
            if box is None:
                continue
            if short_side(box) < min_side:
                counts["skipped_small"] += 1
                continue
            if label == "bag" and (box[2] - box[0]) / (box[3] - box[1]) < BAG_MIN_ASPECT:
                counts["skipped_sliver"] += 1
                continue
            row = Row(
                path=f"crops/{label}/mm-{split}-{stem}-{class_id}.jpg",
                label=label, source="mm", split=split, group=f"mm:{item_id}", origin="studio",
            )
            pending.append(_Pending(row, image_path, widen(box, width, height)))
    return pending


def dhash(image: Image.Image) -> str:
    """64-bit difference hash as 16 hex chars: stable under resizing and re-encoding."""
    small = np.asarray(image.convert("L").resize((9, 8), Image.BILINEAR), dtype=np.int16)
    bits = (small[:, :-1] > small[:, 1:]).flatten()
    return f"{int(''.join('1' if b else '0' for b in bits), 2):016x}"


def _collect_web(data: Path, min_side: int, counts: Counter) -> list[_Pending]:
    """Web photos from raw/web/<label>/<source>/**; each image is one item (or one pair of shoes)."""
    pending: list[_Pending] = []
    seen: set[str] = set()  # global across labels: the first path in sorted order wins
    base = data / "raw" / "web"
    label_dirs = sorted(base.iterdir()) if base.is_dir() else []
    for label_dir in label_dirs:
        if label_dir.name.startswith(".") or not label_dir.is_dir():
            continue
        label = label_dir.name
        for path in sorted(p for p in label_dir.rglob("*") if p.is_file()):
            if path.suffix.lower() not in WEB_SUFFIXES or path.name.startswith("."):
                continue
            image = _open_rgb(path)
            if image is None:
                counts["skipped_unreadable"] += 1
                continue
            width, height = image.size
            if min(width, height) < min_side:
                counts["skipped_small"] += 1
                continue
            digest = dhash(image)
            if digest in seen:
                counts["skipped_duplicate"] += 1
                continue
            seen.add(digest)
            split = mm_split(digest)
            row = Row(
                path=f"crops/{label}/web-{split}-{digest}.jpg",
                label=label, source="web", split=split, group=f"web:{digest}", origin="web",
            )
            pending.append(_Pending(row, path, (0, 0, width, height)))
    return pending


def _write_crops(data: Path, pending: list[_Pending], counts: Counter) -> list[_Pending]:
    """Write each crop; return the pending items that were written (undecodable images are left out)."""
    written: list[_Pending] = []
    last_path: Path | None = None
    image: Image.Image | None = None
    for p in sorted(pending, key=lambda p: str(p.image)):
        if p.image != last_path:
            image = _open_rgb(p.image)
            last_path = p.image
        if image is None:
            counts["skipped_unreadable"] += 1
            continue
        crop = image.crop(p.box)
        scale = LONG_SIDE / max(crop.size)
        size = (max(1, round(crop.width * scale)), max(1, round(crop.height * scale)))
        crop = crop.resize(size, Image.LANCZOS)
        out = data / p.row.path
        out.parent.mkdir(parents=True, exist_ok=True)
        crop.save(out, "JPEG", quality=JPEG_QUALITY)
        written.append(p)
    return written


def _check_inputs(data: Path) -> None:
    """Fail before anything is deleted if raw/ is incomplete or has a stray raw/web folder."""
    required = (
        data / "raw" / "deepfashion2" / "train" / "annos",
        data / "raw" / "deepfashion2" / "validation" / "annos",
        data / "raw" / "multimodal" / "parsing",
    )
    for path in required:
        if not path.is_dir():
            what = "unzip DeepFashion2 into raw/deepfashion2/ (train and validation)" if "deepfashion2" in path.parts else "restore the MultiModal download under raw/multimodal/"
            raise ValueError(f"missing {path}; {what}; see docs/ml.md")
    web = data / "raw" / "web"
    for label_dir in sorted(web.iterdir()) if web.is_dir() else []:
        if label_dir.name.startswith(".") or not label_dir.is_dir():
            continue
        if label_dir.name not in LABELS:
            raise ValueError(f"raw/web/{label_dir.name} is not a label; expected one of {list(LABELS)}")


def prepare(data: Path, garment_cap: int = 8000, min_side: int = 64, accessory_cap: int = 4000) -> dict[str, int]:
    """Rebuild data/crops/ and data/manifest.csv from data/raw/. Returns summary counts."""
    data = Path(data)
    data.mkdir(parents=True, exist_ok=True)
    _check_inputs(data)
    shutil.rmtree(data / "crops", ignore_errors=True)
    (data / "manifest.csv").unlink(missing_ok=True)

    counts: Counter = Counter()
    pending = _collect_df2(data, min_side, counts) + _collect_mm(data, min_side, counts)
    pending += _collect_web(data, min_side, counts)  # last, so the garment cap draws the same rows as before

    kept_rows = cap_per_label([p.row for p in pending], garment_cap, GARMENT_LABELS)
    # accessories are capped per (label, source) so on-body MultiModal crops and web photos each fill their own budget
    for label in sorted(ACCESSORY_LABELS):
        for source in ("mm", "web"):
            from_source = [r for r in kept_rows if r.source == source and r.label == label]
            dropped = set(from_source) - set(cap_per_label(from_source, accessory_cap, {label}))
            kept_rows = [r for r in kept_rows if r not in dropped]
    kept = set(kept_rows)
    counts["dropped_by_cap"] = len(pending) - len(kept_rows)
    pending = [p for p in pending if p.row in kept]

    pending = _write_crops(data, pending, counts)
    write_manifest(data / "manifest.csv", [p.row for p in pending])
    counts["crops"] = len(pending)
    return {key: counts[key] for key in SUMMARY_KEYS}


def _print_table(rows) -> None:
    table = Counter((r.label, r.split) for r in rows)
    print(f"{'label':<12}{'train':>8}{'val':>8}")
    for label in LABELS:
        print(f"{label:<12}{table[(label, 'train')]:>8}{table[(label, 'val')]:>8}")


def main(argv: list[str] | None = None) -> None:
    from .manifest import read_manifest

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--garment-cap", type=int, default=8000)
    parser.add_argument("--accessory-cap", type=int, default=4000)
    args = parser.parse_args(argv)
    summary = prepare(args.data, garment_cap=args.garment_cap, accessory_cap=args.accessory_cap)
    for key, value in summary.items():
        print(f"{key}: {value}")
    _print_table(read_manifest(args.data / "manifest.csv"))


if __name__ == "__main__":
    main()
