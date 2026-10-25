import re
import subprocess
import sys

import pytest
from PIL import Image

pytest.importorskip("executorch")

from stylify_ml.export import main as export_main


def test_score_prints_top3(tmp_path):
    export_main(["--placeholder", "--out", str(tmp_path)])
    for name, colour in (("a.jpg", (200, 30, 30)), ("b.jpg", (30, 30, 200))):
        Image.new("RGB", (300, 400), colour).save(tmp_path / name)
    out = subprocess.run([sys.executable, "-m", "stylify_ml.score", "--pte", str(tmp_path / "classifier.pte"),
                          str(tmp_path / "a.jpg"), str(tmp_path / "b.jpg")], capture_output=True, text=True, check=True)
    lines = out.stdout.strip().splitlines()
    assert [l.split()[0] for l in lines] == ["a.jpg", "b.jpg"]
    for line in lines:
        assert len(re.findall(r"[a-z]+ \d\.\d\d", line)) == 3
