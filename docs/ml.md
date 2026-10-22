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
  raw/clothing/images.csv and images/    the clothing dataset: volunteers' own photos, 400x534
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
| Clothing dataset (CC0) | garments, shoes, hats; half for training, half as the "users" test | https://www.kaggle.com/datasets/agrigorev/clothing-dataset-full: `images.csv` into `raw/clothing/`, and `images_compressed/*.jpg` into `raw/clothing/images/` (the originals are not needed). `uvx kaggle datasets download agrigorev/clothing-dataset-full` fetches it all |

The web photos were added because the owner's own shoe and cap photos failed: every MultiModal shoe, hat and bag is worn or carried by a model, seen from the front. Web folders are read recursively, so any sub-folder layout works. `prepare` removes duplicate images across all of `raw/web/`.

To unzip DeepFashion2 (use `unzip`; Python's `zipfile` decrypts ZipCrypto very slowly):

```bash
mkdir -p ~/stylify-data/raw/deepfashion2 && cd ~/stylify-data/raw/deepfashion2
unzip -q ~/Downloads/train.zip
unzip -q ~/Downloads/validation.zip
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
  - Caps training crops at 8,000 per garment label (`--garment-cap`), and at 4,000 from MultiModal and 4,000 from all web photos together, for each of shoes, hats and bags (`--accessory-cap`). Validation is not capped.
  - Splits: DeepFashion2 keeps its own train/validation split. MultiModal and web photos split 85/15 by a stable hash of the item ID or image hash.
  - The clothing dataset is used whole, uncapped, and split 50/50 **by photographer** (`sender_id`) into `train` and `test`, so one person's room and lighting never appear on both sides. Its labels map as in `CLOTHING_LABEL_TO_LABEL` (`labels.py`); `Body`, `Not sure`, `Other` and `Skip` are dropped. `Hoodie` is sorted by hand in `stylify_ml/clothing_overrides.csv` (pullover → `top`, zip-up → `outerwear`, unclear → `drop`); that file can also correct any other image.
  - Rebuilds everything from `raw/`, so it needs `raw/deepfashion2/` on every run: re-unzip DeepFashion2 before each `prepare`, then delete it again. It stops with an error, before touching `crops/`, if `raw/deepfashion2/` (train and validation) or `raw/multimodal/parsing/` is missing, or if a folder under `raw/web/` is not one of the nine labels.
- **`train`**:
  - Two phases: 3 epochs training only the new 9-output layer (learning rate 1e-3), then 12 epochs on the whole network (1e-4).
  - AdamW with a cosine schedule, label smoothing 0.1, batch 64, MPS. Each label is sampled equally often.
  - Keeps `best.pt` at the best validation balanced accuracy. Every setting is a flag and is recorded in `config.json`.
  - A run takes about 2.5 h on the owner's Mac (mobilenet) and up to 5 h (efficientnet).
- **`evaluate`**:
  - Splits the clothing dataset's test half again by photographer (a stable hash of `group`, about half each): "usersVal" picks the threshold and "users" is the reported test. Neither is trained on, and `prepare` is unchanged.
  - Scores validation, usersVal, users and `personal/`: per-label precision and recall, a confusion matrix, top-1, top-3 and balanced accuracy.
  - Picks the confidence threshold: the lowest at which top-1 predictions are at least 95% correct on usersVal, reweighted so every label counts equally (1.0 if none reaches 95%). Without test rows it falls back to validation; `thresholdFrom` in `metrics.json` says which.
  - Writes everything to `metrics.json`.
- **`export`**:
  - Lowers `best.pt` to ExecuTorch with XNNPACK (float32, input `[1, 3, 224, 224]`).
  - Fails if any logit differs from PyTorch's by more than 1e-3 on 16 validation crops.
  - Writes `classifier.json` with the run, the threshold and the scores.

**Training must not sleep.** Runs have no resume. A Mac that sleeps mid-run (lid closed, or low battery) can kill the DataLoader workers and lose the run, as happened on 2026-10-19. Keep the Mac on power with the lid open, and wrap long commands in `caffeinate -i`.

## Training on Kaggle

Training and evaluation can run on a free Kaggle GPU, which keeps running after the laptop is closed. `prepare` and `export` stay on the Mac: `prepare` needs the DeepFashion2 zips, and `export` needs ExecuTorch.

One-time setup: a Kaggle account with a verified phone number (needed for GPUs and internet access), then `uvx kaggle auth login`.

```bash
# from ml/, after prepare; <user> is the Kaggle username
uv run python -m stylify_ml.bundle --data ~/stylify-data --out ~/stylify-data/kaggle --owner <user>
uvx kaggle datasets create -p ~/stylify-data/kaggle/data   # first time; later: datasets version -p ... -m "<what changed>"
uvx kaggle datasets create -p ~/stylify-data/kaggle/code   # the same, after any change to stylify_ml/
uvx kaggle kernels push -p ~/stylify-data/kaggle/kernel    # starts the run
uvx kaggle kernels status <user>/stylify-train
uvx kaggle kernels output <user>/stylify-train -p ~/stylify-data/kaggle/output
mv ~/stylify-data/kaggle/output/runs/* ~/stylify-data/runs/
uv run python -m stylify_ml.evaluate --data ~/stylify-data --compare
```

- **The bundle has three parts:**
  - `data/` holds `crops.zip`, `manifest.csv` and `personal.zip`, with HEIC photos converted to lossless PNG because Kaggle cannot read HEIC;
  - `code/` holds `stylify_ml.zip` and `job.json`, which lists the models to train (`--models`, default mobilenet and efficientnet);
  - `kernel/` holds the script `stylify_ml/kaggle_kernel.py`, which trains and evaluates each model in turn on a T4 and writes `runs/` as the kernel's output.
- **Both datasets must stay private.** The CLI creates them private; never pass `--public`. DeepFashion's licence forbids redistribution, and the personal photos are private.
- **Wait for processing.** After uploading a new dataset version, wait until Kaggle has finished processing it before pushing the kernel, or the run sees the old version.
- **Limits:** a run may last at most 12 hours, and free GPU time is 30 hours a week.
- `train` and `evaluate` use CUDA when it is available, with float16 mixed precision for training (`--no-amp` turns it off).

## Retrain and ship a model

1. Add or change data under `raw/` or `personal/`. Re-unzip DeepFashion2: `prepare` needs it every run.
2. `prepare`, then `train` each candidate, then `evaluate` each run, then `evaluate --compare`.
3. Pick the winner: the best users top-1 among models whose `.pte` is 20 MB or less, with validation balanced accuracy as the tie-break. Check the personal photos too; a model that is clearly worse on them needs a closer look.
4. `export` the winner to `../mobile/assets/model`. Commit both files.
5. Rebuild the iPhone app so it bundles the new model (`docs/mobile.md`). The app does not read `classifier.json` yet; it will once Plan B lands, taking the labels, preprocessing and threshold from it. A threshold of 1.0 or more means "never pre-fill".

The `.pte` is about 17 MB. If retraining becomes frequent, move it to Git LFS.

## Current model

Shipped 2026-10-22: `efficientnet_b0`, run `20261022-180946-efficientnet_b0`, trained on Kaggle, threshold 0.708 (recalibrated on usersVal on 2026-10-22; it was 0.534 when picked on validation).

Comparison on 2026-10-22, all on the same crops (120,258; 2026-10-22 `prepare`, the first with the clothing dataset). The clothing dataset's test half is 2,478 photos from 185 photographers, none of whose photos were trained on. "Users" is 1,754 of them from 103 photographers; the other 724 (82 photographers) are usersVal, which picks the threshold. Scores below are on users, re-evaluated 2026-10-22. "Personal" is the owner's 16 photos (7 tops, 2 each of outerwear, shorts, shoes and hats, 1 pair of trousers).

| Run | Trained with clothing data | Val bal. acc. | Users top-1 | Users top-3 | Users bal. acc. | Personal top-1 | Threshold | `.pte` |
|---|---|---|---|---|---|---|---|---|
| **efficientnet_b0** `20261022-180946` | yes (Kaggle) | 0.930 | **0.892** | **0.985** | **0.874** | 0.812 (13/16) | 0.708 | 16.1 MB |
| mobilenet_v3_large `20261022-160400` | yes (Kaggle) | 0.918 | 0.870 | 0.980 | 0.833 | 0.688 (11/16) | 0.737 | 16.9 MB |
| efficientnet_b0 `20261022-041033` | no | 0.930 | 0.780 | 0.938 | 0.813 | 0.625 (10/16) | 0.675 | 16.1 MB |
| mobilenet_v3_large `20261022-002231` | no (shipped earlier that day) | 0.917 | 0.744 | 0.931 | 0.770 | 0.812 (13/16) | 0.766 | 16.9 MB |
| mobilenetv4_conv_medium | not trained | | | | | | | 33.6 MB (test export) |

- **The clothing data is what moved the users score.** The two architectures are 2 to 4 points apart; training on the volunteers' photos added 11 to 13 points (users top-1 0.744 → 0.892 from the earlier shipped model to this one), with validation almost unchanged. Validation (mostly DeepFashion2) could not show this gap.
- **With 1,754 test photos the models separate clearly.** The earlier choice of mobilenet rested on 3 of 16 personal photos.
- `mobilenetv4_conv_medium` was not trained: its `.pte` was 33.6 MB in a test export on 2026-10-17/18, over the 20 MB limit.
- Training on Kaggle reproduces the Mac: the same models reach the same validation scores (0.930 and 0.917–0.918).

Targets (from the spec; reported, not enforced):

| Measure | Target | Shipped model |
|---|---|---|
| Validation balanced accuracy | ≥ 85% | 93.0% |
| Personal top-1 | ≥ 80% | 81.2% |
| Personal top-3 | ≥ 95% | 100% |
| Users top-1 (added 2026-10-22) | | 89.2% |
| `.pte` size | ≤ 20 MB | 16.1 MB |

What the shipped model gets wrong, on the users test:

| Mistake | Photos | |
|---|---|---|
| top called `outerwear` | 44 | mostly shirts and cardigan-like tops |
| dress called `top` | 35 | dress recall is 64%: a dress laid flat looks like a long top |
| outerwear called `top` | 31 | |
| trousers called `shorts` | 15 | |

Shoes (recall 100%), hats (precision 97%) and trousers (precision 97%) are strong. There are no bags in either test set, so bags are measured on validation only.

**The threshold is picked on user photos.** Picked on validation (mostly DeepFashion2) it was 0.534, which on users pre-fills 93% of photos with only 91.9% right, and pre-filled two of the owner's photos wrongly (a grey zip hoodie as `trousers` 0.66, a white blouse as `outerwear` 0.65). Picked on usersVal it is 0.708: on users it pre-fills 84% of photos and 94.2% of those are right, and none of the owner's 8 pre-filled photos is wrong.
