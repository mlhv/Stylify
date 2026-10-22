import json
import shutil
import zipfile

import numpy as np
import pillow_heif
import pytest
from PIL import Image

from stylify_ml.bundle import bundle
from stylify_ml.data import load_image
from stylify_ml.kaggle_kernel import stage
from stylify_ml.manifest import Row, write_manifest


def _data(root):
    data = root / "stylify-data"
    (data / "crops" / "top").mkdir(parents=True)
    Image.new("RGB", (32, 48), (200, 10, 10)).save(data / "crops" / "top" / "a.jpg")
    write_manifest(data / "manifest.csv", [Row("crops/top/a.jpg", "top", "df2", "train", "g", "shop")])
    (data / "personal" / "hat").mkdir(parents=True)
    (data / "personal" / "top").mkdir(parents=True)
    Image.new("RGB", (20, 20), (0, 0, 255)).save(data / "personal" / "hat" / "q.jpg")
    pixels = np.zeros((30, 40, 3), dtype=np.uint8)
    pixels[:, :20] = (255, 128, 0)
    pillow_heif.from_bytes(mode="RGB", size=(40, 30), data=pixels.tobytes()).save(data / "personal" / "top" / "p.heic")
    return data


@pytest.fixture
def staged(tmp_path):
    data = _data(tmp_path)
    return data, bundle(data, tmp_path / "out", "minh", ["mobilenet_v3_large"])


def test_bundle_writes_three_uploads(staged):
    data, out = staged
    meta = json.loads((out / "data" / "dataset-metadata.json").read_text())
    assert meta["id"] == "minh/stylify-data"
    code_meta = json.loads((out / "code" / "dataset-metadata.json").read_text())
    assert code_meta["id"] == "minh/stylify-ml-code"
    assert json.loads((out / "code" / "job.json").read_text()) == {"models": ["mobilenet_v3_large"]}
    kernel = json.loads((out / "kernel" / "kernel-metadata.json").read_text())
    assert kernel["id"] == "minh/stylify-train" and kernel["code_file"] == "kaggle_kernel.py"
    assert kernel["is_private"] is True and kernel["enable_gpu"] is True and kernel["enable_internet"] is True
    assert kernel["dataset_sources"] == ["minh/stylify-data", "minh/stylify-ml-code"]
    assert (out / "kernel" / "kaggle_kernel.py").exists()
    assert (out / "data" / "manifest.csv").read_text() == (data / "manifest.csv").read_text()
    with zipfile.ZipFile(out / "data" / "crops.zip") as z:
        assert z.namelist() == ["crops/top/a.jpg"]
    with zipfile.ZipFile(out / "code" / "stylify_ml.zip") as z:
        assert {"stylify_ml/train.py", "stylify_ml/evaluate.py", "stylify_ml/labels.py"} <= set(z.namelist())


def test_bundle_turns_heic_into_identical_png(staged, tmp_path):
    data, out = staged
    with zipfile.ZipFile(out / "data" / "personal.zip") as z:
        assert sorted(z.namelist()) == ["personal/", "personal/hat/q.jpg", "personal/top/p.png"]
        z.extractall(tmp_path / "x")
    png = load_image(tmp_path / "x" / "personal" / "top" / "p.png")
    assert np.array_equal(np.asarray(png), np.asarray(load_image(data / "personal" / "top" / "p.heic")))


def test_bundle_without_personal_photos(tmp_path):
    data = _data(tmp_path)
    shutil.rmtree(data / "personal")
    out = bundle(data, tmp_path / "out", "minh", ["efficientnet_b0"])
    with zipfile.ZipFile(out / "data" / "personal.zip") as z:
        assert z.namelist() == ["personal/"]


def test_bundle_rejects_bad_input(tmp_path):
    data = _data(tmp_path)
    with pytest.raises(ValueError, match="models"):
        bundle(data, tmp_path / "out", "minh", ["resnet50"])
    (data / "manifest.csv").unlink()
    with pytest.raises(FileNotFoundError, match="prepare"):
        bundle(data, tmp_path / "out", "minh", ["efficientnet_b0"])


def _unzip_like_kaggle(src, dest):
    """Kaggle may unpack an uploaded x.zip into a folder x/ holding the archive's own x/."""
    dest.mkdir(parents=True)
    for f in src.iterdir():
        if f.suffix == ".zip":
            with zipfile.ZipFile(f) as z:
                z.extractall(dest / f.stem)
        else:
            shutil.copy(f, dest / f.name)


@pytest.mark.parametrize("unpacked", [False, True])
def test_kernel_stages_data_and_code(staged, tmp_path, unpacked):
    _, out = staged
    inputs = tmp_path / "input"
    for name, slug in (("data", "stylify-data"), ("code", "stylify-ml-code")):
        if unpacked:
            _unzip_like_kaggle(out / name, inputs / slug)
        else:
            shutil.copytree(out / name, inputs / slug)
    work, tmp = tmp_path / "working", tmp_path / "tmp"
    data, code, models = stage(inputs, work, tmp)
    assert models == ["mobilenet_v3_large"]
    assert (data / "crops" / "top" / "a.jpg").is_file()
    assert (data / "personal" / "top" / "p.png").is_file()
    assert (data / "manifest.csv").is_file()
    assert (data / "runs").resolve() == (work / "runs").resolve()
    assert (code / "stylify_ml" / "train.py").is_file()
    assert stage(inputs, work, tmp)[0] == data  # a second call reuses what is there
