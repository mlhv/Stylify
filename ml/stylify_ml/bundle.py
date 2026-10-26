"""Stage the Kaggle uploads: the data, the code and the training kernel. See docs/ml.md."""

from __future__ import annotations

import argparse
import json
import shutil
import zipfile
from pathlib import Path

from .data import load_image
from .models import MODEL_NAMES

PACKAGE = Path(__file__).parent
DATA_SLUG, CODE_SLUG, KERNEL_SLUG = "stylify-data", "stylify-ml-code", "stylify-train"


def _zip_dir(src: Path, dest: Path, arc_root: str) -> None:
    """Zip `src` as `arc_root/...`, uncompressed: the crops are JPEGs already."""
    with zipfile.ZipFile(dest, "w", zipfile.ZIP_STORED) as z:
        for path in sorted(p for p in src.rglob("*") if p.is_file() and not p.name.startswith(".")):
            z.write(path, f"{arc_root}/{path.relative_to(src).as_posix()}")


def _personal_zip(personal: Path, dest: Path) -> None:
    """Personal photos with HEIC turned into lossless PNG (Kaggle has no HEIC reader).

    The PNG holds exactly what `load_image` returns (orientation applied, RGB), so scores match.
    """
    with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("personal/", "")  # so the folder exists even with no photos
        if not personal.is_dir():
            return
        for path in sorted(p for p in personal.rglob("*") if p.is_file() and not p.name.startswith(".")):
            rel = path.relative_to(personal)
            if path.suffix.lower() == ".heic":
                tmp = dest.parent / "photo.png"
                load_image(path).save(tmp)
                z.write(tmp, f"personal/{rel.with_suffix('.png').as_posix()}")
                tmp.unlink()
            else:
                z.write(path, f"personal/{rel.as_posix()}")


def _write_json(path: Path, value: dict) -> None:
    path.write_text(json.dumps(value, indent=2) + "\n")


def _check_jobs(jobs: list[dict]) -> None:
    """Every job's args must parse as `stylify_ml.train` arguments, so a typo fails here and not hours in."""
    from .train import build_parser  # imports torch; only needed with jobs

    for job in jobs:
        try:
            build_parser().parse_args(["--data", "d", "--run-id", job["run_id"], *job["args"]])
        except SystemExit:
            raise ValueError(f"job {job['run_id']} has arguments train does not accept: {job['args']}") from None


def bundle(data: Path, out: Path, owner: str, models: list[str], jobs: list[dict] | None = None) -> Path:
    """Write out/data, out/code and out/kernel, each ready for the Kaggle CLI. Returns `out`.

    With `jobs` (a sweep file's list), the kernel runs them through `stylify_ml.jobqueue` and `models` is unused.
    """
    data, out = Path(data), Path(out)
    for required in (data / "manifest.csv", data / "crops"):
        if not required.exists():
            raise FileNotFoundError(f"{required} is missing; run prepare first")
    unknown = sorted(set(models) - set(MODEL_NAMES))
    if jobs:
        _check_jobs(jobs)
    elif not models or unknown:
        raise ValueError(f"models must be some of {list(MODEL_NAMES)}, got {models}")
    shutil.rmtree(out, ignore_errors=True)
    data_dir, code_dir, kernel_dir = out / "data", out / "code", out / "kernel"
    for d in (data_dir, code_dir, kernel_dir):
        d.mkdir(parents=True)

    shutil.copy(data / "manifest.csv", data_dir / "manifest.csv")
    _zip_dir(data / "crops", data_dir / "crops.zip", "crops")
    _personal_zip(data / "personal", data_dir / "personal.zip")
    _write_json(data_dir / "dataset-metadata.json",
                {"title": DATA_SLUG, "id": f"{owner}/{DATA_SLUG}", "licenses": [{"name": "other"}]})

    with zipfile.ZipFile(code_dir / "stylify_ml.zip", "w", zipfile.ZIP_DEFLATED) as z:
        for path in sorted(PACKAGE.glob("*.py")):
            z.write(path, f"stylify_ml/{path.name}")
    _write_json(code_dir / "job.json", {"jobs": jobs} if jobs else {"models": models})
    _write_json(code_dir / "dataset-metadata.json",
                {"title": CODE_SLUG, "id": f"{owner}/{CODE_SLUG}", "licenses": [{"name": "other"}]})

    shutil.copy(PACKAGE / "kaggle_kernel.py", kernel_dir / "kaggle_kernel.py")
    _write_json(kernel_dir / "kernel-metadata.json", {
        "id": f"{owner}/{KERNEL_SLUG}",
        "title": KERNEL_SLUG,
        "code_file": "kaggle_kernel.py",
        "language": "python",
        "kernel_type": "script",
        "is_private": True,
        "enable_gpu": True,
        "enable_tpu": False,
        "enable_internet": True,  # pretrained ImageNet weights are downloaded
        "machine_shape": "NvidiaTeslaT4",
        "dataset_sources": [f"{owner}/{DATA_SLUG}", f"{owner}/{CODE_SLUG}"],
        "competition_sources": [],
        "kernel_sources": [],
        "model_sources": [],
    })
    return out


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--owner", required=True, help="Kaggle username")
    parser.add_argument("--models", nargs="+", default=["mobilenet_v3_large", "efficientnet_b0"],
                        choices=MODEL_NAMES)
    parser.add_argument("--jobs", type=Path, default=None,
                        help="a sweep file (e.g. sweeps/kaggle.json) to run instead of --models")
    args = parser.parse_args(argv)
    jobs = json.loads(args.jobs.read_text()) if args.jobs else None
    print(bundle(args.data, args.out, args.owner, args.models, jobs=jobs))


if __name__ == "__main__":
    main()
