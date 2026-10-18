import numpy as np

from stylify_ml.boxes import mask_box, short_side, widen


def test_mask_box():
    m = np.zeros((100, 80), np.uint8); m[10:20, 30:50] = 11
    assert mask_box(m, 11) == (30, 10, 50, 20)
    assert mask_box(m, 7) is None


def test_widen_adds_ten_percent_per_side():
    assert widen((100, 100, 200, 300), 1000, 1000) == (90, 80, 210, 320)


def test_widen_clamps_to_image():
    assert widen((0, 0, 50, 50), 60, 60) == (0, 0, 55, 55)


def test_short_side():
    assert short_side((0, 0, 64, 200)) == 64
