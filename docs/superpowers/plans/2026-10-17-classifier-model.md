# Clothing Classifier, Plan A: the Model Pipeline

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `uv` Python project in `ml/` that turns DeepFashion2 and DeepFashion-MultiModal into a crop cache, trains and compares three classifiers, and exports the winner as `classifier.pte` plus `classifier.json` for the app.

**Architecture:** Pure helpers (labels, boxes, manifest, metrics) are unit-tested; four command-line entry points (`prepare`, `train`, `evaluate`, `export`) compose them. All data lives in `~/stylify-data/`, passed as `--data`; the repo holds code and the exported model only. Export runs first in the task order so Plan B can build against a placeholder model.

**Tech Stack:** Python 3.12, uv, PyTorch 2.14.1 (MPS), torchvision 0.29.1, timm, ExecuTorch 1.5.1 (XNNPACK), Pillow with pillow-heif, NumPy, pytest.

**Spec:** `docs/superpowers/specs/2026-10-17-clothing-classifier-design.md` (sections "Datasets", "Labels", "Part 1").

## Global Constraints

- Python 3.12. Exact pins: `torch==2.14.1`, `torchvision==0.29.1`, `executorch==1.5.1`. Every other dependency is pinned with `==` to the version `uv` resolves; no ranges.
- Labels, in output order: `top, outerwear, trousers, shorts, skirt, dress, shoes, hat, bag`.
- Model input `float32 [1, 3, 224, 224]`, output `float32 [1, 9]`. Every training and evaluation image ends as a **stretched** 224×224 resize (no aspect-preserving crop) with ImageNet mean `[0.485, 0.456, 0.406]` and std `[0.229, 0.224, 0.225]`.
- Datasets, crops, runs and personal photos never go in the repo. Only `mobile/assets/model/classifier.pte` and `classifier.json` are committed.
- Nothing in `ml/` may touch `server/`, `shared/`, `frontend/` or the root `package.json` (those deploy).
- Commands run from `ml/` as `uv run ...`.

## Review Focus

1. **iPhone photos in `personal/` are HEIC and carry EXIF rotation.** Expected: they load and are scored upright. Test in Task 6 (`test_load_personal_reads_heic_and_applies_exif_rotation`).
2. **A DeepFashion2 box that runs past the image edge, or is degenerate.** Expected: clamped, or skipped and counted, never a crash or an empty crop. Test in Task 3 (`test_widen_clamps_to_image`, `test_prepare_skips_degenerate_box`).
3. **A corrupt or unreadable image in a dataset.** Expected: skipped, counted in the summary, the run continues. Test in Task 4 (`test_prepare_skips_unreadable_image`).
4. **A label with no examples in an evaluation set** (likely in `personal/` early on). Expected: metrics report it as missing instead of dividing by zero; balanced accuracy averages over present labels. Test in Task 5 (`test_balanced_accuracy_ignores_absent_labels`).
5. **Running `prepare` twice, or after changing rules.** Expected: the crop cache and manifest are rebuilt from scratch, no stale crops mixed in. Test in Task 4 (`test_prepare_rebuilds_cleanly`).

## File Structure

```
ml/
  pyproject.toml, uv.lock, .python-version
  stylify_ml/
    labels.py      LABELS, DF2 and MultiModal mappings
    models.py      build_model, checkpoint save/load
    export.py      CLI: .pte + classifier.json, --placeholder
    boxes.py       mask_box, widen, short_side
    manifest.py    Row, read/write, MultiModal item id and split, per-label cap
    prepare.py     CLI: raw data -> crops/ + manifest.csv
    metrics.py     confusion matrix, per-label precision/recall, top-k, balanced accuracy, threshold
    data.py        transforms, ManifestDataset, sampler, load_personal
    train.py       CLI
    evaluate.py    CLI, --compare
  tests/
    test_labels.py, test_export.py, test_boxes.py, test_manifest.py,
    test_prepare.py, test_metrics.py, test_data.py, test_train_evaluate.py
docs/ml.md
```

---

### Task 1: Project scaffold and labels

**Files:**
- Create: `ml/pyproject.toml`, `ml/.python-version`, `ml/stylify_ml/__init__.py`, `ml/stylify_ml/labels.py`, `ml/tests/test_labels.py`
- Modify: `.gitignore` (add `ml/.venv/`, `ml/**/__pycache__/`, `ml/.pytest_cache/`)

**Interfaces:**
- Produces: `LABELS: tuple[str, ...]` (the 9 labels in order); `DF2_CATEGORY_TO_LABEL: dict[int, str]`; `MM_CLASS_TO_LABEL: dict[int, str]`; `label_index(label: str) -> int`.

- [ ] **Step 1: Create the project.** In `ml/`: `uv init --package --name stylify-ml --python 3.12 --no-readme`, rename the generated package to `stylify_ml`, then `uv add torch==2.14.1 torchvision==0.29.1 executorch==1.5.1 timm pillow pillow-heif numpy` and `uv add --dev pytest`. Rewrite every non-exact specifier in `pyproject.toml` to `==` the resolved version and run `uv lock`.

- [ ] **Step 2: Write the failing tests** in `tests/test_labels.py`:

```python
def test_labels_in_output_order():
    assert LABELS == ("top", "outerwear", "trousers", "shorts", "skirt", "dress", "shoes", "hat", "bag")

def test_df2_mapping_covers_all_13_categories():
    assert DF2_CATEGORY_TO_LABEL == {
        1: "top", 2: "top", 5: "top", 6: "top",          # short/long sleeve top, vest, sling
        3: "outerwear", 4: "outerwear",                    # short/long sleeve outwear
        7: "shorts", 8: "trousers", 9: "skirt",
        10: "dress", 11: "dress", 12: "dress", 13: "dress",
    }

def test_multimodal_mapping_uses_only_shoes_hat_bag():
    assert MM_CLASS_TO_LABEL == {11: "shoes", 7: "hat", 12: "bag"}  # footwear, headwear, bag

def test_label_index():
    assert label_index("top") == 0 and label_index("bag") == 8
```

- [ ] **Step 3: Run** `uv run pytest tests/test_labels.py -v`. Expected: FAIL (import error).
- [ ] **Step 4: Implement `stylify_ml/labels.py`** with the constants above.
- [ ] **Step 5: Run** `uv run pytest -v`. Expected: 4 passed.
- [ ] **Step 6: Commit**

```bash
git add .gitignore ml/
git commit -m "feat(ml): uv project and the nine labels"
```

### Task 2: Models, checkpoints and export (with placeholder)

**Files:**
- Create: `ml/stylify_ml/models.py`, `ml/stylify_ml/export.py`, `ml/tests/test_export.py`

**Interfaces:**
- Consumes: `LABELS`.
- Produces:
  - `MODEL_NAMES = ("mobilenet_v3_large", "efficientnet_b0", "mobilenetv4_conv_medium")`
  - `build_model(name: str, num_classes: int = 9, pretrained: bool = True) -> torch.nn.Module` (torchvision for the first two with `weights="IMAGENET1K_V2"` / `"IMAGENET1K_V1"`, `timm.create_model(..., pretrained=..., num_classes=...)` for the third; final classifier layer replaced with `num_classes` outputs)
  - `head_parameters(model, name) -> Iterable[Parameter]` (the replaced layer only, for phase 1)
  - `save_checkpoint(path, model, name: str, extra: dict) -> None` and `load_checkpoint(path) -> tuple[torch.nn.Module, dict]`; the file holds `{"model": name, "labels": list(LABELS), "state_dict": ..., **extra}`
  - `export_pte(model, out_path: Path) -> int` (bytes written; `torch.export.export` → `to_edge_transform_and_lower(..., partitioner=[XnnpackPartitioner()])` → `to_executorch()`, input `torch.rand(1, 3, 224, 224)`)
  - `check_parity(pte_path: Path, model, inputs: torch.Tensor, tol: float = 1e-3) -> float` (max abs logit difference via `executorch.runtime.Runtime`; raises `ParityError` above `tol`)
  - `write_metadata(out_dir: Path, **fields) -> dict` writes `classifier.json` with exactly the spec's keys: `labels, inputSize (224), resizeMode ("stretch"), normalize {mean, std}, threshold, model, run, exportedAt, scores {valBalancedAccuracy, personalTop1, personalTop3}`
  - CLI: `main(argv: list[str] | None = None) -> None`, run as `python -m stylify_ml.export --run <run-dir> --out <dir>` or `python -m stylify_ml.export --placeholder --out <dir>`. Every CLI module in this plan has the same `main(argv)` shape.

- [ ] **Step 1: Write the failing tests** in `tests/test_export.py` (`tiny` and `other_tiny` are two `torch.nn.Sequential(Conv2d(3, 4, 3), AdaptiveAvgPool2d(1), Flatten(), Linear(4, 9))` in eval mode, built with different `torch.manual_seed` values):

```python
def test_export_parity_on_tiny_model(tmp_path):
    n = export_pte(tiny, tmp_path / "m.pte")
    assert n > 0
    assert check_parity(tmp_path / "m.pte", tiny, torch.rand(4, 3, 224, 224)) < 1e-3

def test_parity_error_when_outputs_differ(tmp_path):
    export_pte(tiny, tmp_path / "m.pte")
    with pytest.raises(ParityError):
        check_parity(tmp_path / "m.pte", other_tiny, torch.rand(2, 3, 224, 224))

def test_metadata_has_the_spec_keys(tmp_path):
    meta = write_metadata(tmp_path, threshold=0.7, model="efficientnet_b0", run="r1",
                          scores={"valBalancedAccuracy": 0.9, "personalTop1": 0.8, "personalTop3": 0.95})
    on_disk = json.loads((tmp_path / "classifier.json").read_text())
    assert on_disk == meta
    assert on_disk["labels"] == list(LABELS) and on_disk["inputSize"] == 224 and on_disk["resizeMode"] == "stretch"
    assert on_disk["normalize"] == {"mean": [0.485, 0.456, 0.406], "std": [0.229, 0.224, 0.225]}

def test_placeholder_cli(tmp_path):
    main(["--placeholder", "--out", str(tmp_path)])
    meta = json.loads((tmp_path / "classifier.json").read_text())
    assert meta["threshold"] == 1.0 and meta["model"] == "placeholder"
    assert (tmp_path / "classifier.pte").stat().st_size > 0

def test_checkpoint_round_trip(tmp_path):
    m = build_model("mobilenet_v3_large", pretrained=False)
    save_checkpoint(tmp_path / "best.pt", m, "mobilenet_v3_large", {"threshold": 0.5})
    loaded, meta = load_checkpoint(tmp_path / "best.pt")
    assert meta["model"] == "mobilenet_v3_large" and meta["threshold"] == 0.5 and meta["labels"] == list(LABELS)
```

Note: when `export.py --run` fails parity, `classifier.json` and `classifier.pte` must not be written to `--out` (export into a temp dir, move on success).

- [ ] **Step 2: Run** `uv run pytest tests/test_export.py -v`. Expected: FAIL (import error).
- [ ] **Step 3: Implement** `models.py` and `export.py` to the interfaces above. `--placeholder` uses `build_model("mobilenet_v3_large", pretrained=False)` with the final layer's weights and bias zeroed (so every label gets 1/9), `threshold` 1.0, `model` "placeholder", `run` null, `scores` all null. `--run` reads `best.pt` and `metrics.json` (from Task 7) for threshold and scores, and runs parity on 16 validation crops from the run's manifest.
- [ ] **Step 4: Run** `uv run pytest -v`. Expected: all pass.
- [ ] **Step 5: Smoke-check each candidate exports.** `uv run python -c` building each of the three `MODEL_NAMES` with `pretrained=False` and `export_pte` to a temp file; print the byte size. Record the three sizes in the commit message. If `mobilenetv4_conv_medium` fails, remove it from `MODEL_NAMES` and note the error (spec: "dropped and recorded").
- [ ] **Step 6: Generate the placeholder for Plan B:** `uv run python -m stylify_ml.export --placeholder --out ../mobile/assets/model`. Expected: `classifier.pte` (about 16 MB) and `classifier.json` with `threshold` 1.0.
- [ ] **Step 7: Commit**

```bash
git add ml/ mobile/assets/model/
git commit -m "feat(ml): model builders, ExecuTorch export with parity check, placeholder model"
```

### Task 3: Boxes and manifest helpers

**Files:**
- Create: `ml/stylify_ml/boxes.py`, `ml/stylify_ml/manifest.py`, `ml/tests/test_boxes.py`, `ml/tests/test_manifest.py`

**Interfaces:**
- Produces:
  - `Box = tuple[int, int, int, int]` (x1, y1, x2, y2, exclusive x2/y2)
  - `mask_box(mask: np.ndarray, class_id: int) -> Box | None` (None if the class has no pixels)
  - `widen(box: Box, width: int, height: int, frac: float = 0.1) -> Box` (left and right each move out by `frac` × the box's width, top and bottom by `frac` × its height; clamped to the `width` × `height` image; rounded to int)
  - `short_side(box: Box) -> int`
  - `@dataclass Row: path: str, label: str, source: str ("df2"|"mm"), split: str ("train"|"val"), group: str, origin: str ("shop"|"user"|"studio")`
  - `write_manifest(path: Path, rows: list[Row])`, `read_manifest(path: Path) -> list[Row]` (CSV with header `path,label,source,split,group,origin`)
  - `mm_item_id(filename: str) -> str` (the `id_\d{8}` part; raises `ValueError` if absent)
  - `mm_split(item_id: str, val_fraction: float = 0.15) -> str` (stable across runs and machines: hash of the item ID, not Python's `hash`)
  - `cap_per_label(rows: list[Row], cap: int, labels: set[str], seed: int = 0) -> list[Row]` (caps only `split == "train"` rows of the given labels)

- [ ] **Step 1: Write the failing tests:**

```python
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

def test_manifest_round_trip(tmp_path):
    rows = [Row("crops/top/a.jpg", "top", "df2", "train", "df2:train:7", "user")]
    write_manifest(tmp_path / "m.csv", rows)
    assert read_manifest(tmp_path / "m.csv") == rows

def test_mm_item_id():
    assert mm_item_id("MEN-Denim-id_00000080-01_7_additional_segm.png") == "id_00000080"
    with pytest.raises(ValueError):
        mm_item_id("no-id-here.png")

def test_mm_split_is_stable_and_about_15_percent():
    ids = [f"id_{i:08d}" for i in range(2000)]
    splits = [mm_split(i) for i in ids]
    assert splits == [mm_split(i) for i in ids]
    assert 0.12 < splits.count("val") / len(ids) < 0.18

def test_cap_per_label_only_caps_train_rows_of_given_labels():
    rows = [Row(f"{i}", "top", "df2", "train", f"g{i}", "user") for i in range(10)] \
         + [Row(f"v{i}", "top", "df2", "val", f"h{i}", "user") for i in range(5)] \
         + [Row(f"b{i}", "bag", "mm", "train", f"k{i}", "studio") for i in range(10)]
    out = cap_per_label(rows, cap=3, labels={"top"})
    assert sum(r.label == "top" and r.split == "train" for r in out) == 3
    assert sum(r.split == "val" for r in out) == 5
    assert sum(r.label == "bag" for r in out) == 10
    assert out == cap_per_label(rows, cap=3, labels={"top"})  # same seed, same result
```

- [ ] **Step 2: Run** `uv run pytest tests/test_boxes.py tests/test_manifest.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement** both modules.
- [ ] **Step 4: Run** `uv run pytest -v`. Expected: all pass.
- [ ] **Step 5: Commit** `git add ml/ && git commit -m "feat(ml): box and manifest helpers"`

### Task 4: `prepare.py`

**Files:**
- Create: `ml/stylify_ml/prepare.py`, `ml/tests/test_prepare.py`

**Interfaces:**
- Consumes: Task 1 mappings; Task 3 `widen`, `mask_box`, `short_side`, `Row`, `write_manifest`, `mm_item_id`, `mm_split`, `cap_per_label`.
- Produces: `prepare(data: Path, garment_cap: int = 8000, min_side: int = 64) -> dict[str, int]` (summary counts, including `skipped_unreadable`, `skipped_occluded`, `skipped_small`, `skipped_degenerate`) and the CLI `python -m stylify_ml.prepare --data <dir> [--garment-cap N]`.
- Reads (layout from the spec):
  - `data/raw/deepfashion2/{train,validation}/annos/<n>.json` and `.../image/<n>.jpg`. Each annotation: top-level `source` (`"shop"`/`"user"`), `pair_id` (int), and `item1`, `item2`, ... each with `category_id` (1 to 13), `bounding_box` `[x1, y1, x2, y2]`, `occlusion` (1 to 3).
  - `data/raw/multimodal/parsing/<stem>_segm.png` and `data/raw/multimodal/images/<stem>.jpg`.
- Writes: `data/crops/<label>/<source>-<split>-<stem>-<k>.jpg` (long side 256, JPEG quality 90) and `data/manifest.csv`. Deletes `data/crops/` and `manifest.csv` first.

Rules (from the spec): skip DF2 items with `occlusion == 3`; skip any box under `min_side` on its short side **before** widening; `group` is `df2:<split>:<pair_id>` or `mm:<item id>`; `origin` is the DF2 `source` or `"studio"`; DF2 split `validation` maps to `"val"`; cap garment labels (`top, outerwear, trousers, shorts, skirt, dress`) in train only. Print the summary and a label × split count table.

- [ ] **Step 1: Write the failing tests,** with a `make_raw(tmp_path)` fixture that writes 2 DF2 train annotations, 1 DF2 validation annotation and 2 MultiModal mask/image pairs (small solid-colour JPEGs, 300×400):

```python
def test_prepare_writes_crops_and_manifest(raw):
    summary = prepare(raw)
    rows = read_manifest(raw / "manifest.csv")
    assert {r.label for r in rows} >= {"top", "trousers", "shoes"}
    for r in rows:
        img = Image.open(raw / r.path)
        assert max(img.size) == 256
    assert summary["crops"] == len(rows)

def test_prepare_skips_heavily_occluded(raw): ...   # item with occlusion 3 absent; summary["skipped_occluded"] == 1
def test_prepare_skips_small_boxes(raw): ...        # 40x40 box absent; summary["skipped_small"] == 1
def test_prepare_skips_degenerate_box(raw): ...     # x2 <= x1 absent; summary["skipped_degenerate"] == 1
def test_prepare_skips_unreadable_image(raw): ...   # a .jpg with garbage bytes: summary["skipped_unreadable"] == 1, others still written
def test_prepare_rebuilds_cleanly(raw):
    prepare(raw); (raw / "crops" / "top" / "stale.jpg").write_bytes(b"x")
    prepare(raw)
    assert not (raw / "crops" / "top" / "stale.jpg").exists()

def test_groups_and_splits(raw):
    rows = read_manifest(raw / "manifest.csv")
    df2_val = [r for r in rows if r.source == "df2" and r.split == "val"]
    assert df2_val and all(r.group.startswith("df2:val:") for r in df2_val)
    assert all(r.origin == "studio" and r.group.startswith("mm:id_") for r in rows if r.source == "mm")
    train_groups = {r.group for r in rows if r.split == "train"}
    assert not train_groups & {r.group for r in rows if r.split == "val"}
```

- [ ] **Step 2: Run** `uv run pytest tests/test_prepare.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement `prepare.py`.**
- [ ] **Step 4: Run** `uv run pytest -v`. Expected: all pass.
- [ ] **Step 5: Commit** `git add ml/ && git commit -m "feat(ml): prepare builds the crop cache and manifest"`

### Task 5: Metrics

**Files:**
- Create: `ml/stylify_ml/metrics.py`, `ml/tests/test_metrics.py`

**Interfaces:**
- Produces (all take `probs: np.ndarray [n, 9]`, `targets: np.ndarray [n]` of label indices):
  - `confusion(probs, targets) -> np.ndarray [9, 9]` (rows true, columns predicted)
  - `per_label(probs, targets) -> dict[str, dict]` with `precision`, `recall`, `support` per label; `None` for precision/recall when undefined
  - `balanced_accuracy(probs, targets) -> float` (mean recall over labels with support > 0)
  - `top_k(probs, targets, k: int) -> float`
  - `pick_threshold(probs, targets, target_precision: float = 0.95) -> float` (candidates are the observed top-1 confidences; spec: smallest `t` such that, among samples with top-1 confidence ≥ `t`, the top-1 is correct for ≥ 95%, each sample weighted by `1 / support(true label)`; returns 1.0 if none)
  - `summarise(probs, targets) -> dict` (all of the above, JSON-serialisable)

- [ ] **Step 1: Write the failing tests:**

```python
def test_balanced_accuracy_weights_labels_equally():
    # 9 correct "top" and 1 wrong "bag" -> plain accuracy 0.9, balanced 0.5
    ...
    assert balanced_accuracy(p, t) == pytest.approx(0.5)

def test_balanced_accuracy_ignores_absent_labels():
    # only labels 0 and 1 present, both perfect
    assert balanced_accuracy(p, t) == 1.0
    assert per_label(p, t)["bag"]["recall"] is None

def test_top_k(): ...                    # top-1 0.5, top-3 1.0 on a hand-built case
def test_confusion_counts(): ...
def test_pick_threshold_finds_smallest_qualifying_confidence():
    # confidences 0.9 (right), 0.8 (right), 0.6 (wrong), 0.5 (right): one label, target 0.95
    assert pick_threshold(p, t) == pytest.approx(0.8)
def test_pick_threshold_returns_one_when_never_reached(): ...
def test_summarise_is_json_serialisable(): json.dumps(summarise(p, t))
```

- [ ] **Step 2: Run** `uv run pytest tests/test_metrics.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement `metrics.py`** with NumPy only.
- [ ] **Step 4: Run** `uv run pytest -v`. Expected: all pass.
- [ ] **Step 5: Commit** `git add ml/ && git commit -m "feat(ml): evaluation metrics and threshold choice"`

### Task 6: Data loading and transforms

**Files:**
- Create: `ml/stylify_ml/data.py`, `ml/tests/test_data.py`

**Interfaces:**
- Consumes: `read_manifest`, `Row`, `label_index`, `LABELS`.
- Produces:
  - `train_transform() -> Callable[[Image], Tensor]`: `RandomResizedCrop` scale (0.6, 1.0) to 256, `RandomHorizontalFlip`, `ColorJitter(0.2, 0.2, 0.1)`, then `eval_transform()`
  - `eval_transform() -> Callable[[Image], Tensor]`: `Resize((224, 224))` (stretched), `ToTensor`, `Normalize(mean, std)`
  - `ManifestDataset(data: Path, split: str, transform)` yielding `(tensor, label_index)`
  - `balanced_sampler(dataset: ManifestDataset) -> WeightedRandomSampler` (weight `1 / count(label)`, `num_samples = len(dataset)`)
  - `load_image(path: Path) -> Image` (RGB; `pillow_heif.register_heif_opener()`; `ImageOps.exif_transpose`)
  - `load_personal(data: Path) -> list[tuple[Path, int]]` from `data/personal/<label>/*.{jpg,jpeg,png,heic}` (case-insensitive); raises `ValueError` naming any folder that is not a label

- [ ] **Step 1: Write the failing tests:**

```python
def test_eval_transform_stretches_to_224():
    x = eval_transform()(Image.new("RGB", (500, 100)))
    assert x.shape == (3, 224, 224)

def test_manifest_dataset_and_sampler(tmp_path): ...   # 3 "top" + 1 "bag" rows: bag weight == 3 * top weight

def test_load_personal_reads_heic_and_applies_exif_rotation(tmp_path):
    # write personal/hat/a.heic (200x100) via pillow_heif, and personal/bag/b.jpg (200x100) with EXIF orientation 6
    items = load_personal(tmp_path)
    assert sorted(i for _, i in items) == [label_index("hat"), label_index("bag")]
    assert load_image(tmp_path / "personal/bag/b.jpg").size == (100, 200)

def test_load_personal_rejects_unknown_folder(tmp_path):
    (tmp_path / "personal/jewellery").mkdir(parents=True)
    with pytest.raises(ValueError, match="jewellery"):
        load_personal(tmp_path)
```

- [ ] **Step 2: Run** `uv run pytest tests/test_data.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement `data.py`.**
- [ ] **Step 4: Run** `uv run pytest -v`. Expected: all pass.
- [ ] **Step 5: Commit** `git add ml/ && git commit -m "feat(ml): datasets, transforms and personal photo loading"`

### Task 7: `train.py` and `evaluate.py`

**Files:**
- Create: `ml/stylify_ml/train.py`, `ml/stylify_ml/evaluate.py`, `ml/tests/test_train_evaluate.py`

**Interfaces:**
- Consumes: `build_model`, `head_parameters`, `save_checkpoint`, `load_checkpoint`, `ManifestDataset`, `balanced_sampler`, the transforms, `load_personal`, `load_image`, `summarise`, `pick_threshold`, `balanced_accuracy`.
- Produces:
  - `train(data: Path, model_name: str, head_epochs=3, head_lr=1e-3, full_epochs=12, full_lr=1e-4, batch_size=64, label_smoothing=0.1, pretrained=True, device=None, run_id=None) -> Path` (the run directory `data/runs/<run_id>/`; default id `<UTC yyyymmdd-hhmmss>-<model>`; device defaults to `mps` if available else `cpu`). Writes `config.json` (every argument), `epochs.jsonl` (one line per epoch: phase, epoch, train loss, val balanced accuracy) and `best.pt` (best val balanced accuracy, via `save_checkpoint`).
  - `evaluate(run: Path, data: Path) -> dict` writes `run/metrics.json`: `{"val": summarise(...), "personal": summarise(...) | null, "threshold": pick_threshold(val), "pteBytes": null}` (`personal` is null when `data/personal/` is missing or empty).
  - `compare(data: Path) -> str`: a table, one row per run with `metrics.json`: run, model, val balanced accuracy, personal top-1, personal top-3, threshold, `.pte` MB (exported to a temp file once and cached in `metrics.json` as `pteBytes`).
  - CLIs: `python -m stylify_ml.train --data D --model M [flags]`, `python -m stylify_ml.evaluate --data D --run R`, `python -m stylify_ml.evaluate --data D --compare`.

- [ ] **Step 1: Write the failing test** (end to end on CPU, tiny): build a fake `data/` with a manifest of 2 train and 1 val crop per label (64×64 solid colours, one colour per label) and 1 personal photo per label, then:

```python
def test_train_then_evaluate_then_compare(tmp_path):
    run = train(data, "mobilenet_v3_large", head_epochs=1, full_epochs=1, batch_size=4, pretrained=False, device="cpu", run_id="t1")
    assert {"config.json", "epochs.jsonl", "best.pt"} <= {p.name for p in run.iterdir()}
    assert len((run / "epochs.jsonl").read_text().splitlines()) == 2
    m = evaluate(run, data)
    assert set(m) == {"val", "personal", "threshold", "pteBytes"}
    assert 0.0 <= m["threshold"] <= 1.0 and m["personal"] is not None
    assert "t1" in compare(data)
```

- [ ] **Step 2: Run** `uv run pytest tests/test_train_evaluate.py -v`. Expected: FAIL.
- [ ] **Step 3: Implement `train.py`.** Phase 1 freezes everything except `head_parameters`; phase 2 unfreezes all. AdamW, `CosineAnnealingLR` per phase, `CrossEntropyLoss(label_smoothing=...)`, `balanced_sampler` for train, `eval_transform` for val.
- [ ] **Step 4: Implement `evaluate.py`.** Softmax probabilities over val (`ManifestDataset` with `eval_transform`) and personal (`load_image` + `eval_transform`).
- [ ] **Step 5: Run** `uv run pytest -v`. Expected: all pass.
- [ ] **Step 6: Commit** `git add ml/ && git commit -m "feat(ml): training with two phases, evaluation and run comparison"`

### Task 8: Real data and the crop cache (needs Minh)

No new code unless a fix is needed. These steps need the DeepFashion2 zip password, a Google Drive download and Minh's photos.

- [ ] **Step 1: Check disk.** `df -h ~` shows at least 16 GB free. Otherwise stop and ask (deleting `~/Downloads/test.zip` frees 3.3 GB).
- [ ] **Step 2: Unzip DeepFashion2** (Minh types the password): `mkdir -p ~/stylify-data/raw/deepfashion2 && cd ~/stylify-data/raw/deepfashion2 && unzip -q ~/Downloads/train.zip && unzip -q ~/Downloads/validation.zip` (prompts for it). Expected: `train/image` has 191,962 files and `validation/image` 32,154.
- [ ] **Step 3: Download MultiModal** images (Drive id `1U2PljA7NE57jcSSzPs21ZurdIPXdYZtN`) and parsing masks (`1r-5t-VgDaAQidZLVgWtguaG7DvMoyUv9`) with `uvx gdown`, unzip into `~/stylify-data/raw/multimodal/images/` and `.../parsing/`. Confirm image stems match mask stems minus `_segm`, and that file names carry `id_\d{8}` (the spec asks for this). If not, fix `mm_item_id` and its test first.
- [ ] **Step 4: Personal photos.** Minh adds about 10 photos per label to `~/stylify-data/personal/<label>/` (HEIC is fine).
- [ ] **Step 5: Run** `uv run python -m stylify_ml.prepare --data ~/stylify-data`. Expected: about 8,000 train crops for each garment label; roughly 10,000 shoes, 1,500 hats and 950 bags in train; no group in both splits; crops/ between 1 and 2 GB (`du -sh`).
- [ ] **Step 6: Look at the crops.** Open 20 random crops per label (for example a contact sheet with Pillow in a scratch script) and check labels and framing. Fix the mapping or crop rules if anything is systematically wrong, and rerun Step 5.
- [ ] **Step 7: Delete** `~/stylify-data/raw/deepfashion2/` (the zips stay in `~/Downloads`).

### Task 9: Train, compare, ship the model, document

- [ ] **Step 1: Train the three candidates,** one at a time (each is long; run in the background and check `epochs.jsonl`): `uv run python -m stylify_ml.train --data ~/stylify-data --model <name>` for each name in `MODEL_NAMES`.
- [ ] **Step 2: Evaluate each:** `uv run python -m stylify_ml.evaluate --data ~/stylify-data --run <run-dir>`.
- [ ] **Step 3: Compare:** `uv run python -m stylify_ml.evaluate --data ~/stylify-data --compare`. Pick the winner by the spec rule: best personal top-1 among models with `.pte` ≤ 20 MB, balanced validation accuracy as tie-break. Report the table and the per-label confusion of the winner to Minh before continuing.
- [ ] **Step 4: Export:** `uv run python -m stylify_ml.export --run <winner> --out ../mobile/assets/model`. Expected: parity passes; `classifier.json` has the run, threshold and scores.
- [ ] **Step 5: Write `docs/ml.md`:** datasets and where to get them, licence limits, the `~/stylify-data/` layout, every command, how to retrain and ship a model (export, then Plan B's rebuild), the comparison table with date, the targets and how the winner met them.
- [ ] **Step 6: Update `AGENTS.md`:** `ml/` in Layout and the path table; `(cd ml && uv run pytest)` in Commands; a rule "Datasets, crops, runs and personal photos never go in the repo (licences forbid redistribution); only `mobile/assets/model/` is committed"; `docs/ml.md` in the Docs table.
- [ ] **Step 7: Run** `cd ml && uv run pytest`. Expected: all pass.
- [ ] **Step 8: Commit**

```bash
git add mobile/assets/model/ docs/ml.md AGENTS.md
git commit -m "feat(ml): ship the trained classifier; docs for the model pipeline"
```
