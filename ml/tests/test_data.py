import pillow_heif
import pytest
from PIL import Image

from stylify_ml.data import (
    ManifestDataset,
    balanced_sampler,
    eval_transform,
    load_image,
    load_personal,
    train_transform,
)
from stylify_ml.labels import label_index
from stylify_ml.manifest import Row, write_manifest


def test_eval_transform_stretches_to_224():
    x = eval_transform()(Image.new("RGB", (500, 100)))
    assert x.shape == (3, 224, 224)


def test_train_transform_outputs_224():
    x = train_transform()(Image.new("RGB", (300, 120)))
    assert x.shape == (3, 224, 224)


def test_manifest_dataset_and_sampler(tmp_path):
    (tmp_path / "crops").mkdir()
    rows = []
    for i, label in enumerate(["top", "top", "top", "bag"]):
        rel = f"crops/{i}.jpg"
        Image.new("RGB", (40, 60), (i * 40, 10, 10)).save(tmp_path / rel)
        rows.append(Row(rel, label, "df2", "train", f"g{i}", "shop"))
    rows.append(Row("crops/0.jpg", "hat", "df2", "val", "gv", "shop"))
    write_manifest(tmp_path / "manifest.csv", rows)

    ds = ManifestDataset(tmp_path, "train", eval_transform())
    assert len(ds) == 4
    x, y = ds[0]
    assert x.shape == (3, 224, 224)
    assert isinstance(y, int) and y == label_index("top")

    w = balanced_sampler(ds).weights
    assert w[3] == pytest.approx(3 * w[0])


def test_load_personal_reads_heic_and_applies_exif_rotation(tmp_path):
    (tmp_path / "personal/hat").mkdir(parents=True)
    (tmp_path / "personal/bag").mkdir(parents=True)
    pillow_heif.from_pillow(Image.new("RGB", (200, 100))).save(tmp_path / "personal/hat/a.heic")
    exif = Image.Exif()
    exif[0x0112] = 6
    Image.new("RGB", (200, 100)).save(tmp_path / "personal/bag/b.jpg", exif=exif)
    (tmp_path / "personal/.DS_Store").write_bytes(b"x")
    items = load_personal(tmp_path)
    assert sorted(i for _, i in items) == sorted([label_index("hat"), label_index("bag")])
    assert load_image(tmp_path / "personal/bag/b.jpg").size == (100, 200)
    assert load_image(tmp_path / "personal/hat/a.heic").size == (200, 100)


def test_load_personal_missing_dir_is_empty(tmp_path):
    assert load_personal(tmp_path) == []


def test_load_personal_rejects_unknown_folder(tmp_path):
    (tmp_path / "personal/jewellery").mkdir(parents=True)
    with pytest.raises(ValueError, match="jewellery"):
        load_personal(tmp_path)
