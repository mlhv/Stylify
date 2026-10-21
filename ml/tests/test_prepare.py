import io
import json
import re
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from stylify_ml.manifest import mm_item_id, mm_split, read_manifest
from stylify_ml.prepare import dhash, prepare

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


def test_prepare_skips_crop_that_fails_to_decode_in_phase_two(raw, monkeypatch):
    import stylify_ml.prepare as prep

    real = prep._open_rgb
    seen: dict[Path, int] = {}

    def flaky(path):
        seen[path] = seen.get(path, 0) + 1
        if path.name == "000003.jpg" and seen[path] > 1:
            return None
        return real(path)

    monkeypatch.setattr(prep, "_open_rgb", flaky)
    summary = prepare(raw)
    rows = read_manifest(raw / "manifest.csv")
    assert summary["skipped_unreadable"] == 1
    assert not any("train-000003-" in r.path for r in rows)
    assert summary["crops"] == len(rows)
    on_disk = {p.relative_to(raw).as_posix() for p in (raw / "crops").rglob("*.jpg")}
    assert on_disk == {r.path for r in rows}


def test_prepare_skips_sliver_bags_but_keeps_wide_ones(raw):
    # 70x250 is 0.28 of its height; the fixture bag in the Dresses file is 220x170 and stays
    _mm(raw / "raw" / "multimodal", "WOMEN-Bags-id_00000200-01_1_front", {12: (100, 100, 170, 350)})
    summary = prepare(raw)
    rows = read_manifest(raw / "manifest.csv")
    assert summary["skipped_sliver"] == 1
    assert not any("id_00000200" in r.path for r in rows)
    assert len([r for r in rows if r.label == "bag"]) == 1


def _pattern(path: Path, kind: str, size=(200, 160)) -> None:
    """A two-tone image; a solid one has an all-zero dHash, so the tests need real structure."""
    path.parent.mkdir(parents=True, exist_ok=True)
    w, h = size
    arr = np.zeros((h, w, 3), dtype=np.uint8)
    if kind == "lr":
        arr[:, : w // 2] = 250
    elif kind == "tb":
        arr[: h // 2, :] = 250
    elif kind == "grad":
        arr[:] = np.linspace(0, 255, w, dtype=np.uint8)[None, :, None]
    img = Image.fromarray(arr)
    img.save(path, "PNG" if path.suffix.lower() == ".png" else "JPEG", quality=95)


def _noise(path: Path, seed: int) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(seed)
    small = rng.integers(0, 256, size=(8, 9, 3), dtype=np.uint8)
    Image.fromarray(small).resize((180, 160), Image.NEAREST).save(path, "JPEG", quality=95)


def _web_rows(raw: Path):
    return [r for r in read_manifest(raw / "manifest.csv") if r.source == "web"]


def test_web_shoes_dedupe_small_and_row_fields(raw):
    shoes = raw / "raw" / "web" / "shoes"
    _pattern(shoes / "shoenet" / "0" / "1.jpg", "lr")
    _pattern(shoes / "shoenet" / "1" / "2.jpg", "tb")
    _pattern(shoes / "jhovanni" / "train" / "boot" / "copy.png", "lr")  # same picture, re-saved
    _pattern(shoes / "jhovanni" / "train" / "boot" / "tiny.jpg", "lr", size=(40, 40))
    (shoes / "shoenet" / "0" / ".hidden.jpg").write_bytes(b"x")
    (shoes / "shoenet" / "0" / "notes.txt").write_text("x")
    summary = prepare(raw)
    rows = _web_rows(raw)
    assert summary["skipped_duplicate"] == 1
    assert summary["skipped_unreadable"] == 0  # .hidden.jpg and notes.txt are skipped before opening
    assert summary["skipped_small"] == 2  # the existing 40x40 df2 box and the tiny web image
    assert len(rows) == 2
    for r in rows:
        assert r.source == r.origin == "web" and r.label == "shoes"
        assert re.fullmatch(r"web:[0-9a-f]{16}", r.group)
        assert r.path == f"crops/shoes/web-{r.split}-{r.group.removeprefix('web:')}.jpg"
        assert r.split == mm_split(r.group.removeprefix("web:"))
        assert max(Image.open(raw / r.path).size) == 256


def test_no_raw_web_dir_gives_no_web_rows(raw):
    summary = prepare(raw)
    assert summary["skipped_duplicate"] == 0
    assert _web_rows(raw) == []


def test_accessory_cap_applies_per_source_to_train_only(raw):
    mm = raw / "raw" / "multimodal"
    ids = [f"id_{n:08d}" for n in range(300, 330)]
    for i in ids:
        _mm(mm, f"WOMEN-Shoes-{i}-01_1_front", {11: (40, 320, 200, 390)})
    for n in range(30):
        _noise(raw / "raw" / "web" / "shoes" / "shoenet" / "0" / f"{n}.jpg", n)
    uncapped = prepare(raw, accessory_cap=10_000)
    before = read_manifest(raw / "manifest.csv")
    for src in ("mm", "web"):
        shoes = [r for r in before if r.source == src and r.label == "shoes"]
        assert len([r for r in shoes if r.split == "train"]) >= 2
        assert any(r.split == "val" for r in shoes)
    assert uncapped["dropped_by_cap"] == 0

    summary = prepare(raw, accessory_cap=1)
    after = read_manifest(raw / "manifest.csv")
    for src in ("mm", "web"):
        shoes = [r for r in after if r.source == src and r.label == "shoes"]
        assert len([r for r in shoes if r.split == "train"]) == 1
        val_before = {r for r in before if r.source == src and r.label == "shoes" and r.split == "val"}
        assert val_before <= set(after)
    assert summary["dropped_by_cap"] > 0
    on_disk = {p.relative_to(raw).as_posix() for p in (raw / "crops").rglob("*.jpg")}
    assert on_disk == {r.path for r in after}


def test_web_shoes_do_not_change_garment_selection(raw):
    prepare(raw, garment_cap=1)
    without = {r for r in read_manifest(raw / "manifest.csv") if r.label != "shoes"}
    for n in range(10):
        _noise(raw / "raw" / "web" / "shoes" / "shoenet" / "0" / f"{n}.jpg", n)
    prepare(raw, garment_cap=1)
    with_web = {r for r in read_manifest(raw / "manifest.csv") if r.label != "shoes"}
    assert without == with_web and without


def _structured(size=(180, 160)) -> Image.Image:
    """Each row of the 9x8 grid is a ramp or a V, giving the hash bits ff 00 f0 0f twice over."""
    rows = [
        [8, 7, 6, 5, 4, 3, 2, 1, 0],  # strictly falling: 11111111
        [0, 1, 2, 3, 4, 5, 6, 7, 8],  # strictly rising: 00000000
        [4, 3, 2, 1, 0, 1, 2, 3, 4],  # falls then rises: 11110000
        [0, 1, 2, 3, 4, 3, 2, 1, 0],  # rises then falls: 00001111
    ] * 2
    grid = np.array(rows, dtype=np.uint8) * 25 + 20
    small = Image.fromarray(grid).convert("RGB")
    return small.resize(size, Image.NEAREST)


def test_dhash_is_stable_under_resize_and_reencode_but_differs_between_images():
    img = _structured()
    h = dhash(img)
    assert h == "ff00f00fff00f00f"  # worked by hand from the definition: left pixel > right pixel, row by row
    assert dhash(img.resize((90, 80))) == h
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=70)
    assert dhash(Image.open(io.BytesIO(buf.getvalue())).convert("RGB")) == h
    assert dhash(img.transpose(Image.FLIP_LEFT_RIGHT)) != h


def test_dedupe_keeps_first_image_in_sorted_path_order(raw):
    shoes = raw / "raw" / "web" / "shoes"
    for folder, size in (("b", (180, 240)), ("a", (180, 160))):  # same hash, different shape
        (shoes / folder).mkdir(parents=True)
        _structured(size).save(shoes / folder / "x.jpg", quality=95)
    summary = prepare(raw)
    (row,) = _web_rows(raw)
    assert summary["skipped_duplicate"] == 1
    assert Image.open(raw / row.path).size == (256, 228)  # a/ is 180x160; b/ would give 171x256


def test_web_hat_and_bag_rows_use_their_folder_label(raw):
    web = raw / "raw" / "web"
    _pattern(web / "hat" / "myntra" / "cap" / "1.jpg", "lr")
    _pattern(web / "bag" / "myntra" / "tote" / "2.jpg", "tb")
    prepare(raw)
    rows = {r.label: r for r in _web_rows(raw)}
    assert set(rows) == {"hat", "bag"}
    for label, r in rows.items():
        assert r.path == f"crops/{label}/web-{r.split}-{r.group.removeprefix('web:')}.jpg"
        assert r.source == r.origin == "web"
        assert (raw / r.path).exists()


def test_unknown_web_label_folder_raises(raw):
    _pattern(raw / "raw" / "web" / "jewellery" / "x" / "a.jpg", "lr")
    with pytest.raises(ValueError, match="jewellery"):
        prepare(raw)


def test_hidden_web_folder_is_skipped(raw):
    _pattern(raw / "raw" / "web" / ".cache" / "x" / "a.jpg", "lr")
    prepare(raw)
    assert _web_rows(raw) == []


def test_accessory_cap_applies_per_label_and_source(raw):
    mm = raw / "raw" / "multimodal"
    for n in range(300, 330):
        _mm(mm, f"WOMEN-Hats-id_{n:08d}-01_1_front", {7: (80, 10, 220, 90)})
    for n in range(30):
        _noise(raw / "raw" / "web" / "hat" / "myntra" / "cap" / f"{n}.jpg", n)
    prepare(raw, accessory_cap=10_000)
    before = read_manifest(raw / "manifest.csv")
    for src in ("mm", "web"):
        hats = [r for r in before if r.source == src and r.label == "hat"]
        assert len([r for r in hats if r.split == "train"]) >= 2
    prepare(raw, accessory_cap=1)
    after = read_manifest(raw / "manifest.csv")
    for src in ("mm", "web"):
        hats = [r for r in after if r.source == src and r.label == "hat"]
        assert len([r for r in hats if r.split == "train"]) == 1
        val_before = {r for r in before if r.source == src and r.label == "hat" and r.split == "val"}
        assert val_before <= set(after)


def test_identical_image_under_bag_and_hat_is_kept_once_under_bag(raw):
    web = raw / "raw" / "web"
    _pattern(web / "hat" / "s" / "a.jpg", "lr")
    _pattern(web / "bag" / "s" / "a.jpg", "lr")
    summary = prepare(raw)
    (row,) = _web_rows(raw)
    assert row.label == "bag"
    assert summary["skipped_duplicate"] == 1


def test_shoe_cap_draws_the_same_rows_as_the_old_per_source_cap(raw):
    from stylify_ml.manifest import cap_per_label

    for n in range(30):
        _noise(raw / "raw" / "web" / "shoes" / "shoenet" / "0" / f"{n}.jpg", n)
    prepare(raw, accessory_cap=10_000)
    web_shoes = [r for r in read_manifest(raw / "manifest.csv") if r.source == "web" and r.label == "shoes"]
    expected = set(cap_per_label(web_shoes, 3, {"shoes"}))  # the pre-change call, on the same candidates
    prepare(raw, accessory_cap=3)
    got = {r for r in read_manifest(raw / "manifest.csv") if r.source == "web" and r.label == "shoes"}
    assert got == expected
