from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from stylify_ml import append_carousell as module
from stylify_ml.append_carousell import append_carousell, carousell_split, near_duplicate_groups
from stylify_ml.manifest import Row, read_manifest, write_manifest


def _noise(path: Path, seed: int, size=(300, 400), mode="RGB") -> None:
    """A distinct image per seed, so dhash differs between files."""
    path.parent.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(seed)
    pixels = rng.integers(0, 256, (size[1] // 20, size[0] // 20, 3), dtype=np.uint8)
    image = Image.fromarray(pixels).resize(size, Image.NEAREST)
    (image.convert("CMYK") if mode == "CMYK" else image).save(path, "JPEG")


def _data(tmp_path: Path, classes=("Kaos", "Mantel", "Jeans", "Gaun", "Hoodie"), per_class=3) -> Path:
    data = tmp_path / "data"
    base = data / "raw" / "carousell" / "Clothes_Dataset"
    seed = 0
    for cls in classes:
        for i in range(per_class):
            seed += 1
            _noise(base / cls / f"{cls.lower()}{i}.jpg", seed)
    (data / "crops" / "top").mkdir(parents=True)
    Image.new("RGB", (64, 64)).save(data / "crops" / "top" / "df2.jpg")
    write_manifest(data / "manifest.csv", [Row("crops/top/df2.jpg", "top", "df2", "train", "df2:1", "shop")])
    return data


@pytest.fixture(autouse=True)
def no_overrides(tmp_path, monkeypatch):
    path = tmp_path / "overrides.csv"
    path.write_text("image,label\n")
    monkeypatch.setattr(module, "OVERRIDES", path)
    return path


def _carousell_rows(data: Path) -> list[Row]:
    return [r for r in read_manifest(data / "manifest.csv") if r.source == "carousell"]


def test_maps_classes_and_drops_hoodie(tmp_path):
    data = _data(tmp_path)
    append_carousell(data)
    rows = _carousell_rows(data)
    assert len(rows) == 12
    by_label = {r.label for r in rows}
    assert by_label == {"top", "outerwear", "trousers", "dress"}
    assert all(r.origin == "user" and r.group.startswith("carousell:") for r in rows)
    assert all(r.path.startswith(f"crops/{r.label}/carousell-{r.split}-") for r in rows)


def test_unknown_class_folder_is_an_error(tmp_path):
    data = _data(tmp_path, classes=("Kaos", "Topi"))
    with pytest.raises(ValueError, match="Topi"):
        append_carousell(data)


def test_overrides_relabel_and_drop(tmp_path, no_overrides):
    data = _data(tmp_path, classes=("Kaos", "Rok"))
    no_overrides.write_text("image,label\nKaos/kaos0.jpg,dress\nRok/rok1.jpg,drop\n")
    append_carousell(data)
    rows = _carousell_rows(data)
    assert len(rows) == 5
    assert sum(r.label == "dress" for r in rows) == 1
    assert sum(r.label == "skirt" for r in rows) == 2


def test_split_is_stable_and_roughly_60_10_30():
    assert carousell_split("abc") == carousell_split("abc")
    splits = [carousell_split(f"g{i}") for i in range(5000)]
    for name, share in (("train", 0.60), ("val", 0.10), ("test", 0.30)):
        assert abs(splits.count(name) / 5000 - share) < 0.03


def test_near_duplicates_share_group_and_split():
    groups = near_duplicate_groups(["0000000000000000", "0000000000000003", "ffffffffffffffff"])
    assert groups[0] == groups[1]
    assert groups[2] != groups[0]


def test_near_duplicates_do_not_chain():
    # a~b (2 bits) and b~c (2 bits), but c is 4 bits from a: chaining would put all three in one group
    groups = near_duplicate_groups(["0000000000000000", "0000000000000003", "000000000000000f"], max_distance=2)
    assert groups[0] == groups[1]
    assert groups[2] != groups[0]


def test_rerun_is_idempotent_and_keeps_other_rows(tmp_path):
    data = _data(tmp_path)
    original = (data / "manifest.csv").read_text()
    append_carousell(data)
    first = (data / "manifest.csv").read_text()
    files_first = sorted(p.name for p in (data / "crops").rglob("carousell-*.jpg"))
    append_carousell(data)
    assert (data / "manifest.csv").read_text() == first
    assert sorted(p.name for p in (data / "crops").rglob("carousell-*.jpg")) == files_first
    rows = read_manifest(data / "manifest.csv")
    assert rows[0] == Row("crops/top/df2.jpg", "top", "df2", "train", "df2:1", "shop")
    assert (data / "manifest-pre-carousell.csv").read_text() == original


def test_skips_unreadable_and_small_and_converts_modes(tmp_path):
    data = _data(tmp_path, classes=("Kaos",), per_class=1)
    base = data / "raw" / "carousell" / "Clothes_Dataset" / "Kaos"
    (base / "empty.jpg").write_bytes(b"")
    _noise(base / "tiny.jpg", 99, size=(20, 20))
    _noise(base / "cmyk.jpg", 100, mode="CMYK")
    counts = append_carousell(data)
    assert counts["skipped_unreadable"] == 1
    assert counts["skipped_small"] == 1
    rows = _carousell_rows(data)
    assert len(rows) == 2
    for r in rows:
        with Image.open(data / r.path) as img:
            assert img.mode == "RGB" and max(img.size) == 256


def test_exact_duplicates_are_dropped(tmp_path):
    data = _data(tmp_path, classes=("Kaos",), per_class=1)
    base = data / "raw" / "carousell" / "Clothes_Dataset" / "Kaos"
    (base / "copy.jpg").write_bytes((base / "kaos0.jpg").read_bytes())
    counts = append_carousell(data)
    assert counts["skipped_duplicate"] == 1
    assert len(_carousell_rows(data)) == 1
