"""Print the top three labels for each photo, scored by a .pte exactly as training preprocesses (eval_transform).

uv run python -I -m stylify_ml.score --pte ../mobile/assets/model/classifier.pte ~/Downloads/IMG_9019.HEIC
"""

from __future__ import annotations

import argparse
from pathlib import Path

import torch
from executorch.runtime import Runtime

from stylify_ml.data import eval_transform, load_image
from stylify_ml.labels import LABELS


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pte", type=Path, required=True)
    parser.add_argument("photos", type=Path, nargs="+")
    args = parser.parse_args(argv)
    method = Runtime.get().load_program(str(args.pte)).load_method("forward")
    transform = eval_transform()
    for path in args.photos:
        x = transform(load_image(path)).unsqueeze(0).contiguous()  # a transposed view gives garbage
        probs = torch.softmax(method.execute([x])[0][0], 0).tolist()
        top = sorted(zip(LABELS, probs), key=lambda t: -t[1])[:3]
        print(path.name, "  ".join(f"{label} {p:.2f}" for label, p in top))


if __name__ == "__main__":
    main()
