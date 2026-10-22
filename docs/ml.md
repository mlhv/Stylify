# Clothing classifier (`ml/`)

The model that suggests a clothing type when a photo is added in the iPhone app. `ml/` turns public datasets into a crop cache, trains candidate networks, compares them, and exports the winner to `mobile/assets/model/` as `classifier.pte` (ExecuTorch) and `classifier.json` (labels, preprocessing, threshold, scores). The design is in `docs/superpowers/specs/2026-10-17-clothing-classifier-design.md`.

`ml/` is a `uv` project on Python 3.12, with every dependency pinned to an exact version. It is not a Bun workspace and deploys nothing.

## Labels

Nine, in output order: `top`, `outerwear`, `trousers`, `shorts`, `skirt`, `dress`, `shoes`, `hat`, `bag`. Garments come from DeepFashion2. Shoes, hats and bags come from DeepFashion-MultiModal (worn by a model) plus web product photos (on their own).

## Data

**Nothing under `~/stylify-data/` goes in the repo.** DeepFashion2 and DeepFashion-MultiModal are licensed for non-commercial research only and may not be redistributed, and the web datasets are scraped. Only the trained model in `mobile/assets/model/` is committed.

```
~/stylify-data/
  raw/deepfashion2/{train,validation}/   unzipped for prepare, then deleted (about 13 GB)
  raw/multimodal/images/ and parsing/    MultiModal images and parsing masks (1.6 GB)
  raw/web/<label>/<source>/...           web photos (630 MB); <label> must be one of the nine
  crops/<label>/*.jpg                    crop cache built by prepare (1.7 GB)
  manifest.csv                           one row per crop: path, label, source, split, group, origin
  personal/<label>/*                     the owner's own photos (jpg, png, heic); never trained on
  runs/<run-id>/                         config.json, epochs.jsonl, best.pt, metrics.json
```

| Source | Used for | Where to get it |
|---|---|---|
| DeepFashion2 | the six garment labels | `train.zip` and `validation.zip` from the dataset authors (https://github.com/switchablenorms/DeepFashion2). The zips are encrypted; the password comes from the authors' request form. Keep the zips. |
| DeepFashion-MultiModal | shoes, hats, bags on a model | https://github.com/yumingj/DeepFashion-MultiModal: the images and the parsing masks, into `raw/multimodal/images/` and `raw/multimodal/parsing/` |
| Shoe-Net-10K | shoes | https://huggingface.co/datasets/prithivMLmods/Shoe-Net-10K, into `raw/web/shoes/shoenet/` |
| jhovanni/shoe-dataset | shoes | https://huggingface.co/datasets/jhovanni/shoe-dataset, `train/` and `validation/` only, into `raw/web/shoes/jhovanni/` |
| Myntra catalogue (384x512) | bags and caps | https://huggingface.co/datasets/benitomartin/fashion-product-images-small-384x512, article types Handbags, Backpacks, Clutches, Laptop Bag, Duffel Bag, Messenger Bag, Rucksacks, Waist Pouch (into `raw/web/bag/myntra/<type>/`) and Caps, Hat (into `raw/web/hat/myntra/<type>/`) |
| Kaggle Headgear (CC0) | hats | https://www.kaggle.com/datasets/gpiosenka/headgear-image-classification. Only the wearable classes ASCOT CAP, BASEBALL CAP, BERET, BOATER, BOWLER, DEERSTALKER, FEDORA, PORK PIE, TOP HAT, into `raw/web/hat/headgear/{train,valid,test}/<CLASS>/` |

The web photos were added because the owner's own shoe and cap photos failed: every MultiModal shoe, hat and bag is worn or carried by a model, seen from the front. Web folders are read recursively, so any sub-folder layout works. `prepare` removes duplicate images across all of `raw/web/`.

To unzip DeepFashion2 (use `unzip`; Python's `zipfile` decrypts ZipCrypto very slowly):

```bash
mkdir -p ~/stylify-data/raw/deepfashion2 && cd ~/stylify-data/raw/deepfashion2
unzip -q -P '<password>' ~/Downloads/train.zip
unzip -q -P '<password>' ~/Downloads/validation.zip
```

The Hugging Face datasets are parquet files. One way to unpack them, run from any empty folder (shown for Myntra; the shoe datasets work the same way with `huggingface_hub`):

```python
# uv run --with pyarrow python fetch_myntra.py ~/stylify-data <tmp-dir>
import sys, urllib.request
from pathlib import Path
import pyarrow.parquet as pq
data, tmp = Path(sys.argv[1]), Path(sys.argv[2])
BAG = {"Handbags", "Backpacks", "Clutches", "Laptop Bag", "Duffel Bag", "Messenger Bag", "Rucksacks", "Waist Pouch"}
HAT = {"Caps", "Hat"}
for k in range(5):
    p = tmp / f"s{k}.parquet"
    urllib.request.urlretrieve(f"https://huggingface.co/datasets/benitomartin/fashion-product-images-small-384x512/resolve/main/data/train-0000{k}-of-00005.parquet", p)
    t = pq.read_table(p, columns=["id", "articleType", "image"]).to_pydict()
    for i, a, img in zip(t["id"], t["articleType"], t["image"]):
        label = "bag" if a in BAG else "hat" if a in HAT else None
        if label:
            d = data / "raw" / "web" / label / "myntra" / a.replace(" ", "_")
            d.mkdir(parents=True, exist_ok=True)
            (d / f"{i}.jpg").write_bytes(img["bytes"])
    p.unlink()
```

## Commands

All from `ml/`.

```bash
uv run pytest                                                          # tests; use no data
uv run python -m stylify_ml.prepare  --data ~/stylify-data             # rebuild crops/ and manifest.csv
uv run python -m stylify_ml.train    --data ~/stylify-data --model mobilenet_v3_large
uv run python -m stylify_ml.evaluate --data ~/stylify-data --run ~/stylify-data/runs/<run-id>
uv run python -m stylify_ml.evaluate --data ~/stylify-data --compare  # one table, every evaluated run
uv run python -m stylify_ml.export   --run ~/stylify-data/runs/<run-id> --out ../mobile/assets/model
uv run python -m stylify_ml.export   --placeholder --out ../mobile/assets/model   # untrained, never pre-fills
```

- **`prepare`**:
  - Crops every labelled item: DeepFashion2 boxes, and the MultiModal footwear, headwear and bag masks. Web photos are used whole.
  - Resizes the long side to 256 and writes `manifest.csv`. It empties `crops/` first.
  - Skips crops under 64 px on the short side, heavily occluded DeepFashion2 items, MultiModal bag slivers (narrower than 0.4 of their height), and duplicate web photos.
  - Caps training crops at 8,000 per garment label (`--garment-cap`), and at 4,000 per source for each of shoes, hats and bags (`--accessory-cap`). Validation is not capped.
  - Splits: DeepFashion2 keeps its own train/validation split. MultiModal and web photos split 85/15 by a stable hash of the item ID or image hash.
  - Run it after any change to `raw/`, then delete `raw/deepfashion2/`.
- **`train`**:
  - Two phases: 3 epochs training only the new 9-output layer (learning rate 1e-3), then 12 epochs on the whole network (1e-4).
  - AdamW with a cosine schedule, label smoothing 0.1, batch 64, MPS. Each label is sampled equally often.
  - Keeps `best.pt` at the best validation balanced accuracy. Every setting is a flag and is recorded in `config.json`.
  - A run takes about 2.5 h on the owner's Mac (mobilenet) and up to 5 h (efficientnet).
- **`evaluate`**:
  - Scores validation and `personal/`: per-label precision and recall, a confusion matrix, top-1, top-3 and balanced accuracy.
  - Picks the confidence threshold: the lowest at which top-1 predictions are at least 95% correct on validation, reweighted so every label counts equally (1.0 if none reaches 95%).
  - Writes everything to `metrics.json`.
- **`export`**:
  - Lowers `best.pt` to ExecuTorch with XNNPACK (float32, input `[1, 3, 224, 224]`).
  - Fails if any logit differs from PyTorch's by more than 1e-3 on validation crops.
  - Writes `classifier.json` with the run, the threshold and the scores.

**Training must not sleep.** Runs have no resume. A Mac that sleeps mid-run (lid closed, or low battery) can kill the DataLoader workers and lose the run, as happened on 2026-10-19. Keep the Mac on power with the lid open, and wrap long commands in `caffeinate -i`.

## Retrain and ship a model

1. Add or change data under `raw/` or `personal/`. Re-unzip DeepFashion2 if `prepare` needs it.
2. `prepare`, then `train` each candidate, then `evaluate` each run, then `evaluate --compare`.
3. Pick the winner: the best personal top-1 among models whose `.pte` is 20 MB or less, with validation balanced accuracy as the tie-break.
4. `export` the winner to `../mobile/assets/model`. Commit both files.
5. Rebuild the iPhone app so it bundles the new model (`docs/mobile.md`). The app reads the labels, preprocessing and threshold from `classifier.json`. A threshold of 1.0 or more means "never pre-fill".

The `.pte` is about 17 MB. If retraining becomes frequent, move it to Git LFS.

## Current model

Shipped 2026-10-22: `mobilenet_v3_large`, run `20261022-002231-mobilenet_v3_large`, threshold 0.579.

Comparison on 2026-10-22, on the same crops (115,234; 2026-10-21 `prepare`) and on 16 personal photos (7 tops, 2 each of outerwear, shorts, shoes and hats, 1 pair of trousers; no skirts, dresses or bags yet):

| Model | Val balanced acc. | Val top-1 | Personal top-1 | Personal top-3 | Threshold | `.pte` |
|---|---|---|---|---|---|---|
| **mobilenet_v3_large** | 0.917 | 0.889 | **0.812** (13/16) | **1.000** | 0.579 | 16.9 MB |
| efficientnet_b0 | 0.930 | 0.901 | 0.625 (10/16) | 0.938 | 0.536 | 16.1 MB |
| mobilenetv4_conv_medium | not trained | | | | | 33.6 MB |

- `mobilenetv4_conv_medium` was dropped because its `.pte` is over the 20 MB limit, so the selection rule excludes it whatever it scores.
- Earlier runs in `--compare` (2026-10-18 and 10-19) were trained before the web photos and scored on fewer personal photos, so their numbers are not comparable.
- Before the web photos, both models missed both of the owner's shoes and both hats. The owner's NY cap was called `top` at 0.85–0.88, above the threshold.

Targets (from the spec; reported, not enforced):

| Measure | Target | Shipped model |
|---|---|---|
| Validation balanced accuracy | ≥ 85% | 91.7% |
| Personal top-1 | ≥ 80% | 81.2% |
| Personal top-3 | ≥ 95% | 100% |
| `.pte` size | ≤ 20 MB | 16.9 MB |

What the shipped model gets wrong:

- **Personal photos.** It misses 3 of 16:
  - the NY cap (`top` 0.27);
  - a lace cami (`skirt` 0.54);
  - a white blouse (`outerwear` 0.53).

  All three are below the threshold, so the app would ask instead of pre-filling a wrong type.
- **Validation.** Outerwear has the lowest precision (0.61): tops and dresses are often called `outerwear`. Shorts (0.80) and dress (0.83) are next. Shoes, hats and bags are at 0.95 or above, but their validation photos come from the same sources as training, so that overstates real-world accuracy.

The 16 photos are too few to separate the models with confidence. More photos of bags, dresses, skirts, hats and outerwear will make the next comparison more reliable.
