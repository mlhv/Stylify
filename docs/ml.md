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
| Carousell clothes (MIT) | the six garment labels in ordinary rooms; 60% training, 10% "carousellVal", 30% the "carousell" test | https://www.kaggle.com/datasets/ryanbadai/clothes-dataset: 15 classes × 500 second-hand listing photos, into `raw/carousell/Clothes_Dataset/<class>/`. Added by `append_carousell`, not `prepare` (below) |

Carousell was added on 2026-10-25 because the owner's photos of clothes laid on a bed or floor failed: no other source shows garments in a room. `append_carousell` appends it to the existing `manifest.csv` and `crops/` without re-running `prepare` (so DeepFashion2 need not be re-unzipped). It is safe to run twice. It maps classes as in `CAROUSELL_CLASS_TO_LABEL` (Hoodie is dropped: pullover or zip-up cannot be told apart), removes exact duplicates and groups near-duplicates (dHash distance 4 or less to a group's first photo) so a group never crosses splits, and applies the hand corrections in `stylify_ml/carousell_overrides.csv` (from a spot check of 7 classes). The manifest before the first append is kept as `manifest-pre-carousell.csv`. **A later `prepare` drops the Carousell rows: run `append_carousell` again after it.**

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
uv run python -m stylify_ml.append_carousell --data ~/stylify-data     # after every prepare
uv run python -m stylify_ml.train    --data ~/stylify-data --model efficientnet_b0 --source-weight carousell=4
uv run python -m stylify_ml.evaluate --data ~/stylify-data --run ~/stylify-data/runs/<run-id>
uv run python -m stylify_ml.evaluate --data ~/stylify-data --compare --baseline <shipped run-id>
uv run python -m stylify_ml.jobqueue --data ~/stylify-data --jobs sweeps/sweep.json --stop-at 21:30   # or --hours 10
uv run python -m stylify_ml.export   --run ~/stylify-data/runs/<run-id> --out ../mobile/assets/model
uv run python -m stylify_ml.score    --pte <dir>/classifier.pte photo.heic ...   # top-3 for any photos
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
  - Keeps `best.pt` at the best validation balanced accuracy. Every setting is a flag and is recorded in `config.json`. `trained.json` is written last, so a run without it did not finish.
  - `--source-weight carousell=4` (repeatable) shows that source's photos 4× as often within each label, still with every label sampled equally. `--augment strong` adds tighter crops, small rotations, more colour change and random erasing.
  - A run takes about 2.5 h on the owner's Mac (mobilenet) and up to 5 h (efficientnet).
- **`evaluate`**:
  - Splits the clothing dataset's test half again by photographer (a stable hash of `group`, about half each): "usersVal" picks the threshold and "users" is the reported test. Neither is trained on, and `prepare` is unchanged.
  - Splits the Carousell test rows the same way (by group) into "carousellVal" and "carousell".
  - Scores validation, usersVal, users, carousellVal, carousell, `personal/` and, if present, `room/<label>/` (the owner's photos in their room, never trained on): per-label precision and recall, a confusion matrix, top-1, top-3 and balanced accuracy.
  - Picks the confidence threshold: the lowest at which top-1 predictions are at least 95% correct on usersVal and carousellVal together, reweighted so every label counts equally (1.0 if none reaches 95%). Without test rows it falls back to validation; `thresholdFrom` in `metrics.json` says which.
  - Writes everything to `metrics.json`.
  - `--compare --baseline <run>` adds a mean of users and carousell top-1, a verdict per run (`ok`; `unscored` without carousell; `acc-drop` if shoe, hat or bag recall falls more than 0.02 below the baseline; `too-big` over 20 MB) and a `winner:` line: the best mean among `ok` runs.
- **`jobqueue`** runs a JSON list of `{"run_id", "args"}` jobs (`sweeps/*.json`), each trained then evaluated, logging to `logs/<run-id>.log`. Safe to stop and restart: finished runs are skipped, trained ones are only evaluated, half-written ones are moved to `runs/_failed/` and trained again. With `--stop-at HH:MM` or `--hours N` it starts no job that the longest job so far would push past the limit.
- **`export`**:
  - Lowers `best.pt` to ExecuTorch with XNNPACK (float32, input `[1, 3, 224, 224]`).
  - Fails if any logit differs from PyTorch's by more than 1e-3 on 16 validation crops.
  - Writes `classifier.json` with the run, the threshold and the scores.
  - `--int8` quantises with PT2E and refuses the result if top-1 agrees with float on less than 90% of a balanced validation sample. On 2026-10-25 EfficientNet-B0 agreed on only 64–70% (4.5 MB against 16.1 MB), so the app ships float.

**Training must not sleep.** Runs have no resume. A Mac that sleeps mid-run (lid closed, or low battery) can kill the DataLoader workers and lose the run, as happened on 2026-10-19. Keep the Mac on power with the lid open, and wrap long commands in `caffeinate -i`.

## Training on Kaggle

Training and evaluation can run on a free Kaggle GPU, which keeps running after the laptop is closed. `prepare` and `export` stay on the Mac: `prepare` needs the DeepFashion2 zips, and `export` needs ExecuTorch.

One-time setup: a Kaggle account with a verified phone number (needed for GPUs and internet access), then `uvx kaggle auth login`.

```bash
# from ml/, after prepare; <user> is the Kaggle username
uv run python -m stylify_ml.bundle --data ~/stylify-data --out ~/stylify-data/kaggle --owner <user>
uvx kaggle datasets create -p ~/stylify-data/kaggle/data   # first time; later: datasets version -p ... -m "<what changed>"
uvx kaggle datasets create -p ~/stylify-data/kaggle/code   # the same, after any change to stylify_ml/
uvx kaggle kernels push -p ~/stylify-data/kaggle/kernel    # starts the run (with --jobs sweeps/kaggle.json on bundle: a sweep)
uvx kaggle kernels status <user>/stylify-train
uvx kaggle kernels output <user>/stylify-train -p ~/stylify-data/kaggle/output
mv ~/stylify-data/kaggle/output/runs/* ~/stylify-data/runs/
uv run python -m stylify_ml.evaluate --data ~/stylify-data --compare --baseline <shipped run-id>
```

- **The bundle has three parts:**
  - `data/` holds `crops.zip`, `manifest.csv` and `personal.zip`, with HEIC photos converted to lossless PNG because Kaggle cannot read HEIC;
  - `code/` holds `stylify_ml.zip` and `job.json`: either the models to train with default settings (`--models`, default mobilenet and efficientnet) or, with `--jobs <sweep file>`, a job list for `jobqueue`;
  - `kernel/` holds the script `stylify_ml/kaggle_kernel.py`, which trains and evaluates on a T4 and writes `runs/` and `logs/` as the kernel's output. It first checks every crop in `manifest.csv` was uploaded, and runs a job list within 10.5 hours (`QUEUE_HOURS`), so it never reaches Kaggle's 12-hour cut-off.
- **Both datasets must stay private.** The CLI creates them private; never pass `--public`. DeepFashion's licence forbids redistribution, and the personal photos are private.
- **Wait for processing.** After uploading a new dataset version, wait until Kaggle has finished processing it before pushing the kernel, or the run sees the old version.
- **Limits:** a session may last at most 12 hours, and free GPU time is 30 hours a week. Output appears only when the whole session ends; there is no way to read the logs mid-run.
- **Timing on 2026-10-26** (127,126 crops, `--workers 4`): an EfficientNet-B0 run takes about 1 h 26 min, plus about 45 min for the first run while the crops are read cold; `--augment strong` takes 1 h 53 min. Five runs fit in one session (`sweeps/kaggle.json`).

## Training on the gaming PC

The owner's PC (RTX 5070, Windows with WSL2) can train too: `docs/superpowers/handoffs/2026-10-25-pc-training-handoff.md` is a self-contained guide for a Claude Code session in WSL. `scripts/pc_setup.sh <mac>` installs the project without ExecuTorch (`uv sync --no-group export`), checks CUDA (the locked torch is built for CUDA 13, which needs a Windows NVIDIA driver 580 or newer) and copies the data from the Mac over SSH; `scripts/pc_send_runs.sh <mac>` sends finished runs back. Not yet used: the 2026-10-26 sweep ran on Kaggle.
- `train` and `evaluate` use CUDA when it is available, with float16 mixed precision for training (`--no-amp` turns it off).

## Retrain and ship a model

1. Add or change data under `raw/` or `personal/`. Re-unzip DeepFashion2: `prepare` needs it every run.
2. `prepare`, then `train` each candidate, then `evaluate` each run, then `evaluate --compare`.
3. Pick the winner: `--compare --baseline <shipped run>` names the best mean of users and carousell top-1 among runs with verdict `ok`. Check the personal photos and any room photos too (`score` runs any photo); a model that is clearly worse on them needs a closer look, and between runs within a few photos of each other on the test sets, prefer the one that does better on the owner's photos.
4. `export` the winner to `../mobile/assets/model`. Commit both files.
5. Rebuild the iPhone app so it bundles the new model (`docs/mobile.md`). The app reads the labels, preprocessing and threshold from `classifier.json`. A threshold of 1.0 or more means "never pre-fill".

The `.pte` is about 16 MB. If retraining becomes frequent, move it to Git LFS.

## Current model

Shipped 2026-10-26: `efficientnet_b0`, run `20261026-kg-effb0-cw4` (Carousell weight 4, otherwise default settings), trained on Kaggle, threshold 0.662 (picked on usersVal and carousellVal).

Comparison on 2026-10-26, all on the same crops (127,126: the 2026-10-22 `prepare` plus Carousell). "Users" is 1,754 volunteer photos and "carousell" 989 Carousell photos, none of whose groups were trained on. The 2026-10-22 model was re-evaluated with the new threshold rule, which moved its threshold from 0.708 to 0.809. "Personal" is the owner's 16 photos (7 tops, 2 each of outerwear, shorts, shoes and hats, 1 pair of trousers).

| Run | Val bal. acc. | Users top-1 | Carousell top-1 | Mean | Carousell top-3 | Personal top-1 | Threshold |
|---|---|---|---|---|---|---|---|
| **cw4** `20261026-kg-effb0-cw4` | 0.930 | 0.913 | 0.926 | 0.920 | 0.990 | **0.750 (12/16)** | 0.662 |
| cw4, full lr 2e-4 | **0.935** | **0.917** | **0.928** | **0.923** | 0.991 | 0.688 (11/16) | 0.555 |
| cw8 | 0.928 | 0.905 | 0.925 | 0.915 | 0.989 | 0.688 (11/16) | 0.579 |
| cw4, `--augment strong` | 0.926 | 0.909 | 0.919 | 0.914 | 0.991 | 0.750 (12/16) | 0.615 |
| cw2 | 0.931 | 0.908 | 0.919 | 0.913 | 0.986 | 0.750 (12/16) | 0.545 |
| shipped 2026-10-22 `20261022-180946` (no Carousell) | 0.927 | 0.892 | 0.788 | 0.840 | 0.954 | **0.812 (13/16)** | 0.809 |

All are 16.1 MB. `mobilenet_v3_large` with weight 4 was not trained (it did not fit the Kaggle session). Every run passes the accessory guard.

- **Carousell moved the room score by 14 points** (0.788 → 0.926) and the users score by 2, with validation unchanged. Carousell recall per label went from 0.90/0.71/0.79/0.90/0.71/0.75 (top, outerwear, trousers, shorts, skirt, dress) to 0.93/0.95/0.89/0.95/0.91/0.82.
- **The weight matters little between 2 and 8, and the five runs are within 1 point.** `cw4` was chosen over the comparison's `winner:` (lr 2e-4, 0.3 points higher on the mean, about 8 photos) because it gets one more of the owner's photos right and is less confident when wrong (see below).
- **The owner's four 2026-10-24 room photos** (`~/Downloads/IMG_9018`–`9021`): all three models get 2 of 4. The new one gets the cap in a hand right (hat 0.33, a best guess) and the jeans on the floor (trousers 0.88), and gets the Snoopy pyjama bottoms wrong as shorts (0.63, a best guess, below the threshold) and the sheer top on a hanger wrong as skirt (0.77, pre-filled). The old one called the pyjamas trousers 0.49 and the cap a dress.
- **Personal fell from 13 to 12 of 16:** two tops are now called outerwear and one a skirt, where the old model called one top outerwear and one a skirt.

Targets (from the spec; reported, not enforced):

| Measure | Target | Shipped model |
|---|---|---|
| Validation balanced accuracy | ≥ 85% | 93.0% |
| Personal top-1 | ≥ 80% | 75.0% (missed) |
| Personal top-3 | ≥ 95% | 93.8% (missed) |
| Users top-1 | | 91.3% |
| Carousell top-1 (added 2026-10-25) | | 92.6% |
| `.pte` size | ≤ 20 MB | 16.1 MB |

What the shipped model gets wrong most often:

| Mistake | Users | Carousell | |
|---|---|---|---|
| top called `outerwear` | 47 | 16 | shirts and cardigan-like tops |
| dress called `top` | 31 | 5 | users dress recall is 67%: a dress laid flat looks like a long top |
| outerwear called `top` | 19 | 9 | |
| trousers called `shorts` | 14 | 9 | |

**The threshold is picked on user and room photos.** Since 2026-10-25 it is picked on usersVal and carousellVal together, so it reflects photos taken in rooms as well as the volunteers'. Below it, the app still pre-fills its best guess but says so ("My best guess is X. Tap another if it's not."); see `mobile/src/lib/suggestion.ts`.
