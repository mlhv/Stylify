"""Bounding-box helpers: mask to box, widening with clamping, and short-side size."""

from __future__ import annotations

import numpy as np

# (x1, y1, x2, y2), with x2 and y2 exclusive.
Box = tuple[int, int, int, int]


def mask_box(mask: np.ndarray, class_id: int) -> Box | None:
    """Tight box around the pixels equal to class_id, or None if there are none."""
    ys, xs = np.nonzero(mask == class_id)
    if xs.size == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def widen(box: Box, width: int, height: int, frac: float = 0.1) -> Box:
    """Grow each side outward by frac of the box size, clamped to the image."""
    x1, y1, x2, y2 = box
    dx = frac * (x2 - x1)
    dy = frac * (y2 - y1)
    return (
        max(0, int(round(x1 - dx))),
        max(0, int(round(y1 - dy))),
        min(width, int(round(x2 + dx))),
        min(height, int(round(y2 + dy))),
    )


def short_side(box: Box) -> int:
    x1, y1, x2, y2 = box
    return min(x2 - x1, y2 - y1)
