import pillow_heif
import torch
import pytest
from PIL import Image

from stylify_ml.data import (
    MEAN,
    STD,
    ManifestDataset,
    balanced_sampler,
    eval_transform,
    load_image,
    load_folder,
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


def test_train_transform_crops_vary_on_elongated_images():
    # 100 wide x 256 tall: top half red, bottom half blue. A crop stuck on the middle always shows ~50% red;
    # a real random crop moves the red/blue boundary around.
    img = Image.new("RGB", (100, 256), (255, 0, 0))
    img.paste((0, 0, 255), (0, 128, 100, 256))
    tf = train_transform()
    mean = torch.tensor(MEAN).view(3, 1, 1)
    std = torch.tensor(STD).view(3, 1, 1)
    red_share = []
    for seed in range(50):
        torch.manual_seed(seed)
        out = tf(img) * std + mean
        red = (out[0] > 0.6) & (out[2] < 0.4)
        blue = (out[2] > 0.6) & (out[0] < 0.4)
        red_share.append(red.sum().item() / max(1, (red | blue).sum().item()))
    assert max(red_share) - min(red_share) > 0.15
    assert any(r < 0.45 for r in red_share) and any(r > 0.55 for r in red_share)


def test_load_folder_rejects_unknown_label(tmp_path):
    (tmp_path / "room/socks").mkdir(parents=True)
    with pytest.raises(ValueError, match="room/socks"):
        load_folder(tmp_path, "room")


class _Rows:
    def __init__(self, rows):
        self.rows = rows


def _row(label, source):
    return Row(f"crops/{label}/{source}.jpg", label, source, "train", "g", "shop")


def test_sampler_keeps_labels_balanced_with_source_weights():
    rows = [_row("top", "df2")] * 90 + [_row("top", "carousell")] * 10 + [_row("dress", "df2")] * 50
    w = torch.as_tensor(balanced_sampler(_Rows(rows), {"carousell": 9}).weights)
    top, carousell, dress = w[:100].sum(), w[90:100].sum(), w[100:].sum()
    assert torch.isclose(top, dress)
    assert torch.isclose(carousell, top / 2)


def test_sampler_default_unchanged():
    rows = [_row("top", "df2")] * 3 + [_row("top", "carousell")] + [_row("dress", "df2")] * 2
    w = balanced_sampler(_Rows(rows)).weights.tolist()
    assert w == pytest.approx([0.25] * 4 + [0.5] * 2)


def test_strong_transform_shape():
    assert train_transform("strong")(Image.new("RGB", (300, 200))).shape == (3, 224, 224)
    with pytest.raises(ValueError):
        train_transform("bogus")
