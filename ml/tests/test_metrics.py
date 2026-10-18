import json
import warnings

import numpy as np
import pytest

from stylify_ml.labels import LABELS, label_index
from stylify_ml.metrics import (
    balanced_accuracy,
    confusion,
    per_label,
    pick_threshold,
    summarise,
    top_k,
)

N = len(LABELS)


def probs_for(preds, conf=0.9):
    """One row per predicted label index, `conf` on it, the rest spread evenly."""
    p = np.full((len(preds), N), (1 - conf) / (N - 1))
    for i, c in enumerate(preds):
        p[i, c] = conf
    return p


def test_balanced_accuracy_weights_labels_equally():
    # 9 correct "top" and 1 wrong "bag" -> plain accuracy 0.9, balanced 0.5
    top, bag = label_index("top"), label_index("bag")
    t = np.array([top] * 9 + [bag])
    p = probs_for([top] * 10)
    assert balanced_accuracy(p, t) == pytest.approx(0.5)


def test_balanced_accuracy_ignores_absent_labels():
    # only labels 0 and 1 present, both perfect
    t = np.array([0, 0, 1])
    p = probs_for([0, 0, 1])
    assert balanced_accuracy(p, t) == 1.0
    assert per_label(p, t)["bag"]["recall"] is None


def test_top_k():
    # top-1 0.5, top-3 1.0 on a hand-built case
    p = np.zeros((2, N))
    p[0, 0], p[0, 1], p[0, 2] = 0.5, 0.3, 0.2   # target 0: rank 1
    p[1, 0], p[1, 1], p[1, 2] = 0.5, 0.3, 0.2   # target 2: rank 3
    t = np.array([0, 2])
    assert top_k(p, t, 1) == pytest.approx(0.5)
    assert top_k(p, t, 3) == pytest.approx(1.0)


def test_confusion_counts():
    t = np.array([0, 0, 1, 2])
    p = probs_for([0, 1, 1, 0])
    c = confusion(p, t)
    assert c.shape == (N, N)
    assert c[0, 0] == 1 and c[0, 1] == 1 and c[1, 1] == 1 and c[2, 0] == 1
    assert c.sum() == 4


def test_per_label_precision_and_undefined():
    t = np.array([0, 0, 1])
    p = probs_for([0, 1, 1])
    with warnings.catch_warnings():
        warnings.simplefilter("error")
        r = per_label(p, t)
    assert r["top"] == {"precision": 1.0, "recall": 0.5, "support": 2}
    assert r["outerwear"]["precision"] == 0.5
    assert r["trousers"] == {"precision": None, "recall": None, "support": 0}


def test_pick_threshold_finds_smallest_qualifying_confidence():
    # confidences 0.9 (right), 0.8 (right), 0.6 (wrong), 0.5 (right): one label, target 0.95
    p = np.zeros((4, N))
    p[0, 0] = 0.9
    p[1, 0] = 0.8
    p[2, 1], p[2, 0] = 0.6, 0.4
    p[3, 0] = 0.5
    t = np.zeros(4, dtype=int)
    assert pick_threshold(p, t) == pytest.approx(0.8)
    assert isinstance(pick_threshold(p, t), float)


def test_pick_threshold_weights_samples_by_inverse_support():
    # label 0 has one sample, wrongly predicted as label 1 at 0.7; label 1 has 19 correct at 0.9.
    # Unweighted precision at t=0.7 is 19/20 = 0.95 (qualifies); weighted it is 0.5, so only 0.9 qualifies.
    p = np.zeros((20, N))
    p[0, 1], p[0, 0] = 0.7, 0.3
    p[1:, 1], p[1:, 0] = 0.9, 0.1
    t = np.array([0] + [1] * 19)
    assert pick_threshold(p, t) == pytest.approx(0.9)


def test_pick_threshold_returns_one_when_never_reached():
    p = probs_for([1, 1], conf=0.7)
    t = np.array([0, 0])
    assert pick_threshold(p, t) == 1.0


def test_empty_input_does_not_crash():
    p, t = np.zeros((0, N)), np.zeros(0, dtype=int)
    assert pick_threshold(p, t) == 1.0
    assert balanced_accuracy(p, t) == 0.0


def test_summarise_is_json_serialisable():
    t = np.array([0, 0, 1, 2])
    p = probs_for([0, 1, 1, 0])
    s = summarise(p, t)
    json.dumps(s)
    assert set(s) == {"n", "top1", "top3", "balanced_accuracy", "per_label", "confusion"}
    assert s["n"] == 4 and type(s["n"]) is int
    assert type(s["top1"]) is float and type(s["balanced_accuracy"]) is float
    assert set(s["per_label"]) == set(LABELS)
    assert type(s["confusion"][0][0]) is int
