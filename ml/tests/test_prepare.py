import json
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from stylify_ml.manifest import mm_item_id, read_manifest
from stylify_ml.prepare import prepare

W, H = 300, 400


def _jpg(path: Path, colour=(120, 80, 200)) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (W, H), colour).save(path, "JPEG")


def _anno(root: Path, split: str, n: str, pair_id: int, items: list[dict], source="shop") -> None:
    (root / split / "annos").mkdir(parents=True, exist_ok=True)
    data = {"source": source, "pair_id": pair_id}
    for i, item in enumerate(items, start=1):
        data[f"item{i}"] = item
    (root / split / "annos" / f"{n}.json").write_text(json.dumps(data))
    _jpg(root / split / "image" / f"{n}.jpg")


def _item(cat: int, box: list[int], occlusion: int = 1) -> dict:
    return {"category_id": cat, "bounding_box": box, "occlusion": occlusion}


def _mm(root: Path, stem: str, classes: dict[int, tuple[int, int, int, int]]) -> None:
    (root / "images").mkdir(parents=True, exist_ok=True)
    (root / "parsing").mkdir(parents=True, exist_ok=True)
    _jpg(root / "images" / f"{stem}.jpg")
    mask = np.zeros((H, W), dtype=np.uint8)
    for class_id, (x1, y1, x2, y2) in classes.items():
        mask[y1:y2, x1:x2] = class_id
    Image.fromarray(mask).save(root / "parsing" / f"{stem}_segm.png")


def make_raw(tmp_path: Path) -> Path:
    df2 = tmp_path / "raw" / "deepfashion2"
    _anno(df2, "train", "000001", 1, [_item(1, [20, 20, 220, 220]), _item(8, [30, 230, 200, 390])])
    _anno(df2, "train", "000002", 2, [_item(2, [20, 20, 220, 220], occlusion=3)], source="user")
    _anno(df2, "train", "000003", 3, [_item(1, [50, 50, 250, 300])], source="user")
    _anno(df2, "train", "000004", 4, [_item(8, [10, 10, 50, 50])])           # 40x40: small
    _anno(df2, "train", "000005", 5, [_item(8, [200, 100, 100, 300])])       # x2 <= x1: degenerate
    _anno(df2, "validation", "000001", 6, [_item(10, [20, 20, 250, 380])])

    mm = tmp_path / "raw" / "multimodal"
    _mm(mm, "MEN-Denim-id_00000080-01_7_additional",
        {11: (40, 320, 200, 390), 7: (80, 10, 220, 90), 10: (100, 100, 180, 140)})  # 10 is dropped
    _mm(mm, "WOMEN-Dresses-id_00000123-02_4_full", {12: (30, 150, 250, 320), 11: (60, 325, 240, 395)})
    return tmp_path


@pytest.fixture
def raw(tmp_path: Path) -> Path:
    return make_raw(tmp_path)


def test_prepare_writes_crops_and_manifest(raw):
    summary = prepare(raw)
    rows = read_manifest(raw / "manifest.csv")
    assert {r.label for r in rows} >= {"top", "trousers", "shoes"}
    for r in rows:
        img = Image.open(raw / r.path)
        assert max(img.size) == 256
    assert summary["crops"] == len(rows)
    assert len(list((raw / "crops").rglob("*.jpg"))) == len(rows)
    # the dropped mask class produced no crop: 3 mm classes kept in file 1 minus one, plus 2 in file 2
    assert len([r for r in rows if r.source == "mm"]) == 4


def test_prepare_skips_heavily_occluded(raw):
    summary = prepare(raw)
    rows = read_manifest(raw / "manifest.csv")
    assert summary["skipped_occluded"] == 1
    assert not any("train-000002-" in r.path for r in rows)


def test_prepare_skips_small_boxes(raw):
    summary = prepare(raw)
    rows = read_manifest(raw / "manifest.csv")
    assert summary["skipped_small"] == 1
    assert not any("train-000004-" in r.path for r in rows)


def test_prepare_skips_degenerate_box(raw):
    summary = prepare(raw)
    rows = read_manifest(raw / "manifest.csv")
    assert summary["skipped_degenerate"] == 1
    assert not any("train-000005-" in r.path for r in rows)


def test_prepare_skips_unreadable_image(raw):
    (raw / "raw" / "deepfashion2" / "train" / "image" / "000003.jpg").write_bytes(b"not a jpeg")
    summary = prepare(raw)
    rows = read_manifest(raw / "manifest.csv")
    assert summary["skipped_unreadable"] == 1
    assert not any("train-000003-" in r.path for r in rows)
    assert any("train-000001-" in r.path for r in rows)
    assert any(r.source == "mm" for r in rows)


def test_prepare_skips_missing_image_and_unknown_category(raw):
    (raw / "raw" / "deepfashion2" / "train" / "image" / "000003.jpg").unlink()
    _anno(raw / "raw" / "deepfashion2", "train", "000009", 9, [_item(99, [20, 20, 220, 220])])
    summary = prepare(raw)
    assert summary["skipped_missing"] == 1
    assert summary["skipped_unknown_category"] == 1


def test_prepare_rebuilds_cleanly(raw):
    prepare(raw)
    (raw / "crops" / "top" / "stale.jpg").write_bytes(b"x")
    (raw / "personal").mkdir()
    (raw / "personal" / "keep.txt").write_text("keep")
    prepare(raw)
    assert not (raw / "crops" / "top" / "stale.jpg").exists()
    assert (raw / "personal" / "keep.txt").exists()


def test_cap_removes_dropped_crops(raw):
    summary = prepare(raw, garment_cap=1)
    rows = read_manifest(raw / "manifest.csv")
    assert len([r for r in rows if r.label == "top" and r.split == "train"]) == 1
    on_disk = {p.relative_to(raw).as_posix() for p in (raw / "crops").rglob("*.jpg")}
    assert on_disk == {r.path for r in rows}
    assert summary["crops"] == len(rows)


def test_groups_and_splits(raw):
    prepare(raw)
    rows = read_manifest(raw / "manifest.csv")
    df2_val = [r for r in rows if r.source == "df2" and r.split == "val"]
    assert df2_val and all(r.group.startswith("df2:val:") for r in df2_val)
    assert all(r.origin == "studio" and r.group.startswith("mm:id_") for r in rows if r.source == "mm")
    assert {r.group for r in rows if r.source == "mm"} == {"mm:id_00000080", "mm:id_00000123"}
    assert mm_item_id("MEN-Denim-id_00000080-01_7_additional.jpg") == "id_00000080"
    train_groups = {r.group for r in rows if r.split == "train"}
    assert not train_groups & {r.group for r in rows if r.split == "val"}
