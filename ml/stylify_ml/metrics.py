"""Evaluation metrics for the 9-label classifier, and the confidence-threshold choice."""

import numpy as np

from stylify_ml.labels import LABELS

N_LABELS = len(LABELS)


def _pred(probs: np.ndarray) -> np.ndarray:
    return np.asarray(probs).argmax(axis=1) if len(probs) else np.zeros(0, dtype=int)


def confusion(probs: np.ndarray, targets: np.ndarray) -> np.ndarray:
    """Counts with rows the true label and columns the predicted label."""
    m = np.zeros((N_LABELS, N_LABELS), dtype=int)
    np.add.at(m, (np.asarray(targets, dtype=int), _pred(probs)), 1)
    return m


def per_label(probs: np.ndarray, targets: np.ndarray) -> dict[str, dict]:
    m = confusion(probs, targets)
    out: dict[str, dict] = {}
    for i, name in enumerate(LABELS):
        support = int(m[i].sum())
        predicted = int(m[:, i].sum())
        tp = int(m[i, i])
        out[name] = {
            "precision": tp / predicted if predicted else None,
            "recall": tp / support if support else None,
            "support": support,
        }
    return out


def balanced_accuracy(probs: np.ndarray, targets: np.ndarray) -> float:
    recalls = [v["recall"] for v in per_label(probs, targets).values() if v["recall"] is not None]
    return float(sum(recalls) / len(recalls)) if recalls else 0.0


def top_k(probs: np.ndarray, targets: np.ndarray, k: int) -> float:
    probs = np.asarray(probs)
    if len(probs) == 0:
        return 0.0
    best = np.argsort(-probs, axis=1, kind="stable")[:, :k]
    hits = (best == np.asarray(targets, dtype=int)[:, None]).any(axis=1)
    return float(hits.mean())


def pick_threshold(probs: np.ndarray, targets: np.ndarray, target_precision: float = 0.95) -> float:
    """Smallest top-1 confidence t whose accepted samples reach the target weighted precision.

    Each sample is weighted by 1 / support(true label), so rare labels count as much as common ones.
    Returns 1.0 when no observed confidence qualifies.
    """
    probs = np.asarray(probs)
    if len(probs) == 0:
        return 1.0
    targets = np.asarray(targets, dtype=int)
    conf = probs.max(axis=1)
    correct = (probs.argmax(axis=1) == targets).astype(float)
    support = np.bincount(targets, minlength=N_LABELS)
    weight = 1.0 / support[targets]
    for t in np.unique(conf):  # ascending
        keep = conf >= t
        if (weight[keep] * correct[keep]).sum() / weight[keep].sum() >= target_precision:
            return float(t)
    return 1.0


def summarise(probs: np.ndarray, targets: np.ndarray) -> dict:
    return {
        "n": int(len(targets)),
        "top1": top_k(probs, targets, 1),
        "top3": top_k(probs, targets, 3),
        "balanced_accuracy": balanced_accuracy(probs, targets),
        "per_label": per_label(probs, targets),
        "confusion": confusion(probs, targets).tolist(),
    }
