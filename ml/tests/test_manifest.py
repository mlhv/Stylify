import pytest

from stylify_ml.manifest import Row, cap_per_label, mm_item_id, mm_split, read_manifest, write_manifest


def test_manifest_round_trip(tmp_path):
    rows = [Row("crops/top/a.jpg", "top", "df2", "train", "df2:train:7", "user")]
    write_manifest(tmp_path / "m.csv", rows)
    assert read_manifest(tmp_path / "m.csv") == rows


def test_mm_item_id():
    assert mm_item_id("MEN-Denim-id_00000080-01_7_additional_segm.png") == "id_00000080"
    with pytest.raises(ValueError):
        mm_item_id("no-id-here.png")


def test_mm_split_is_stable_and_about_15_percent():
    ids = [f"id_{i:08d}" for i in range(2000)]
    splits = [mm_split(i) for i in ids]
    assert splits == [mm_split(i) for i in ids]
    assert 0.12 < splits.count("val") / len(ids) < 0.18


def test_cap_per_label_only_caps_train_rows_of_given_labels():
    rows = [Row(f"{i}", "top", "df2", "train", f"g{i}", "user") for i in range(10)] \
         + [Row(f"v{i}", "top", "df2", "val", f"h{i}", "user") for i in range(5)] \
         + [Row(f"b{i}", "bag", "mm", "train", f"k{i}", "studio") for i in range(10)]
    out = cap_per_label(rows, cap=3, labels={"top"})
    assert sum(r.label == "top" and r.split == "train" for r in out) == 3
    assert sum(r.split == "val" for r in out) == 5
    assert sum(r.label == "bag" for r in out) == 10
    assert out == cap_per_label(rows, cap=3, labels={"top"})  # same seed, same result
