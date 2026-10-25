# Classifier retrain for "in your room" photos

Date: 2026-10-25. Status: for Minh's approval.
Background: `docs/superpowers/handoffs/2026-10-24-classifier-retrain-handoff.md`, `docs/ml.md`.

## Why

The shipped classifier (`efficientnet_b0`, run `20261022-180946`, threshold 0.708) works on the public test photos but not on the photos Minh actually takes: clothes on a bed or a wooden floor, on a hanger, with a room and clutter behind. On the phone, plain t-shirts mostly work, trousers from the in-app camera never did, and everything else gets "Not sure about this one. Which is it?". The app's preprocessing was checked on 2026-10-24 and is not the cause; the training data does not look like these photos.

Minh also wants a guess every time rather than "Not sure", and wants the new model and the app on the phone **by 23:00 on 2026-10-25**.

## Goals

1. The six garment labels (`top`, `outerwear`, `trousers`, `shorts`, `skirt`, `dress`) are recognised reliably in room-style photos.
2. The app always offers its best guess, and says honestly when it is unsure.
3. Training can run on Minh's gaming PC (RTX 5070, Windows with WSL2), driven by a Claude Code session on that PC from handoff documents.
4. A hyperparameter sweep picks the shipped model, and an int8 version ships if it is as good as float.

## Non-goals

- Shoes, hats and bags. Their data stays as it is. The cap-held-in-a-hand case stays unsolved this round.
- Compositing garments onto room backgrounds.
- Open Images, Clothing1M, the Zenodo second-hand set, or scraping Vinted/Depop. (Looked at on 2026-10-25: Open Images' clothing boxes are about 90% on people and loosely labelled; the others are product shots, flat on a sorting table, or of unclear licence.)
- Re-downloading DeepFashion2 or making `prepare` rebuildable again (see "Data").
- Minh photographing training data. Minh's photos are only ever evaluation data.
- Changing the labels, input size (224), normalisation or resize mode. `mobile/src/lib/classifierConfig.ts` rejects any change to labels or resize mode.

## Anti-goals (a failure even if it technically works)

- Shoe, hat or bag recall on validation drops by more than 2 points against the shipped model.
- A `.pte` over 20 MB.
- The app overwrites a type the user chose or typed.
- Any dataset image, crop, or personal photo committed to the repo, or uploaded to a public place. Kaggle datasets stay private.
- Missing the 23:00 deadline because of the later, optional steps (see "Order and cut-offs").

## Decisions made with Minh

- Training data comes from public datasets, not Minh's photos.
- The main new source is the **Carousell clothes dataset** (Kaggle `ryanbadai/clothes-dataset`, MIT licence): 7,500 photos scraped from a second-hand marketplace, 500 in each of 15 classes, mostly on beds, floors, hangers and doors. Downloaded on 2026-10-25 to the session scratchpad; it goes to `~/stylify-data/raw/carousell/Clothes_Dataset/<Class>/`.
- Minh shoots a room test set (about 5–10 photos per garment label) **after** the retrain. It is never trained on and is scored on both the old and the new model. It does not gate shipping today.
- Priority is the six garment labels.
- **App behaviour, "option 2":** always pre-fill the top guess (when the field is open), and change the wording when below the threshold.
- The sweep and int8 quantisation are in scope.
- Training runs on the gaming PC in WSL2; Claude Code is installed in WSL and works from handoff documents. Kaggle remains available in parallel and as the fallback.
- Ship by 23:00 tonight.
- The PC is ready for about 16:00: Minh is there to start it, the Windows NVIDIA driver is recent, WSL can clone the private GitHub repo, and Minh will turn on Remote Login on the Mac. The work branch (not `main`) is pushed to GitHub so the PC can clone it.

## Data

### Carousell into the existing crop cache

The DeepFashion2 zips are no longer on the Mac, so `prepare` cannot rebuild. The current `crops/` (1.8 GB) and `manifest.csv` (120,258 rows) already hold every DeepFashion2, MultiModal, web and clothing-dataset crop. Carousell is **appended**: a new step (for example `python -m stylify_ml.append_carousell --data ~/stylify-data`) that

- reads `raw/carousell/Clothes_Dataset/<Class>/*.jpg`;
- maps classes to labels:

  | Carousell class | Label |
  |---|---|
  | Kaos (t-shirt), Kemeja (shirt), Polo, Sweter (sweater) | `top` |
  | Blazer, Jaket (jacket), Jaket_Denim, Jaket_Olahraga (sports jacket), Mantel (coat) | `outerwear` |
  | Celana_Panjang (long pants), Jeans | `trousers` |
  | Celana_Pendek (shorts) | `shorts` |
  | Rok (skirt) | `skirt` |
  | Gaun (dress) | `dress` |
  | Hoodie | dropped (see below) |

- applies a hand-made overrides file, `stylify_ml/carousell_overrides.csv` (same idea as `clothing_overrides.csv`): relabel or drop single images;
- removes exact and near-duplicate images (same listing photographed twice, or re-uploaded) and keeps duplicates on the same side of the split;
- resizes the long side to 256 like the other crops, uses the photo whole (no boxes), and writes `crops/<label>/carousell-*.jpg`;
- adds rows with `source=carousell`, `origin=user`, and a split from a stable hash: about **60% train, 10% val, 30% test**;
- is idempotent: running it again replaces the earlier Carousell rows and files and leaves every other row alone. Before its first run, `manifest.csv` is copied to `manifest-pre-carousell.csv`.

Hoodie is dropped because the volunteers' dataset showed that hoodies split between pullover (`top`) and zip-up (`outerwear`), and `top`/`outerwear` is already the largest confusion. The builder may instead sort hoodies by hand if time allows.

Cleaning: the builder spot-checks each class (contact sheets of every class are cheap) and adds to the overrides file the obvious junk: collages, big sticker or text overlays, non-clothing, and wrong labels (for example long jeans under shorts, a dress under t-shirt). All 7,500 are not hand-checked. Images that are mostly one garment on a mannequin are kept.

`prepare` must keep working the day the DeepFashion2 zips come back; at the least, the docs say to run the append step again after a `prepare`.

### Held-out sets and how evaluate uses them

`evaluate` gains Carousell's test split, split again by a stable hash into **"carouselVal"** and **"carousel"**, the same way the clothing dataset's test half is split into usersVal and users.

- The threshold is picked on usersVal and carouselVal combined, with the same rule as today (lowest confidence at which top-1 is 95% correct, labels weighted equally).
- `metrics.json` and `evaluate --compare` report carousel top-1, top-3 and balanced accuracy beside users, and per-label recall for shoes, hat and bag on validation.
- An optional `~/stylify-data/room/<label>/` folder is scored exactly like `personal/` when present, so Minh's later test set needs no code change. It is never trained on and never bundled for Kaggle unless asked.

## Training

### The gaming PC (WSL2)

- Everything runs inside WSL2 (Ubuntu), with the data on WSL's own disk (for example `~/stylify-data`), not under `/mnt/c`.
- Code comes from GitHub (`git clone`, then the work branch). Data comes from the Mac with `rsync` over SSH: `crops/`, `manifest.csv`, `personal/`. Minh turns on Remote Login on the Mac (System Settings → General → Sharing) once. Finished `runs/<run-id>/` go back to the Mac's `~/stylify-data/runs/` with `rsync`. If WSL cannot reach the Mac, fall back to Kaggle.
- The ML project installs on Linux with CUDA PyTorch (the pinned torch 2.14.1 / torchvision 0.29.1 wheels on Linux include CUDA; check that they support the 5070, compute capability 12.0). ExecuTorch becomes an optional dependency group used only by `export`, so the PC does not need it; the Mac installs it as before.
- One script started by hand in WSL (for example `ml/scripts/pc_sweep.sh` or a Python module) checks that `torch.cuda.is_available()` and the GPU name, then runs a queue of `train` + `evaluate` jobs one after another, logging to files, and can be stopped and restarted without losing finished runs. `caffeinate` is a Mac tool; on the PC, Windows sleep must be off while it runs (the handoff tells Minh).
- Runs keep their run-id naming so `evaluate --compare` on the Mac shows them beside the old runs.

### The sweep

- The first run is efficientnet_b0 with today's settings plus Carousell. It is the shippable floor and also measures how long one run takes on the 5070.
- The sweep is a queue sized to finish by **21:30**. Variants are the builder's call within: learning rates, epoch counts, augmentation strength (for example stronger crop scale, small rotations, more colour jitter, random erasing for clutter), label smoothing; and at most one other architecture whose `.pte` fits 20 MB (mobilenet_v3_large is known to fit; mobilenetv4_conv_medium does not).
- Kaggle may run a few variants at the same time with the existing bundle path (the bundle must include the new crops and manifest). Kaggle speed-ups (copy inputs to local disk, score a fixed validation sample per epoch) are done only if Kaggle is actually used.
- Whatever has finished at 21:30 is what the winner is chosen from.

**Carousell's weight (Claude's call).** The train sampler balances labels only, so after the split Carousell is roughly 3–15% of each garment label's training images (about 300 to 1,500 against up to 8,000 from DeepFashion2 plus the clothing dataset). That may be too little to move room-style photos. `train` gains a flag that oversamples a source within each label (for example `--source-weight carousell=4`, default 1 for every source, recorded in `config.json`). The first run uses a moderate weight (around 3–4); the weight is the first thing the sweep varies.

### Choosing the winner

Among finished runs **and the shipped model** (`20261022-180946-efficientnet_b0`, re-evaluated on the new manifest early, so it has carousel scores; Claude's call):

1. Drop any run whose `.pte` would exceed 20 MB, or whose shoe, hat or bag recall on validation is more than 2 points below the shipped model's.
2. Pick the best **mean of carousel top-1 and users top-1**. Tie-break: validation balanced accuracy.
3. Look at the personal set and at the four 2026-10-24 photos (`~/Downloads/IMG_9018`–`9021.HEIC`, read in place, never copied without asking Minh). A clearly worse result there needs a closer look before shipping.

If the shipped model wins, the model is not replaced and only the app change ships; in practice this is not expected, because the shipped model has never seen room-style photos.

**Threshold for a trained model (Claude's call).** Today's rule returns 1.0 when no confidence reaches 95% correct, and 1.0 now means "never pre-fill", which would silently undo Goal 2. For a trained model, `evaluate` caps the picked threshold at 0.99 and records in `metrics.json` that it was capped. Only `export --placeholder` writes 1.0.

### Int8

`export` can also produce an int8 `.pte` (post-training quantisation with the XNNPACK quantizer, calibrated on a few hundred training crops). The model's input and output stay float32 `[1, 3, 224, 224]` → 9 logits, so the app does not change. The winner ships as int8 only if its carousel and users top-1 are each within 1 point of the float version and the int8 model gives the same top-1 as float on the four Downloads photos, or nearly; otherwise float ships. `classifier.json` records which (an extra key such as `"quantized": "int8"`; the app ignores unknown keys). The export's PyTorch-match check needs a looser tolerance for int8, compared on top-1 agreement rather than 1e-3 logits.

## App change (mobile)

- `mobile/src/lib/suggestion.ts` `decide()`: pre-fill the top guess whenever the field is open (empty, or still holding the previous pre-fill), regardless of confidence. A threshold of 1 or more still means "never pre-fill", so the placeholder model keeps working. A type the user chose or typed is never overwritten.
- `ClassifierLine`: four states. At or above the threshold: "Ooh, that looks like Trousers!" (unchanged, whether or not the field was pre-filled). Below it, with a pre-fill: "My best guess is Shorts. Tap another if it's not." Below it, without a pre-fill because the field holds the user's own type (typed during the run, or Edit's saved type): "My best guess is Shorts." (Claude's wording for both; Minh may change it). With a threshold of 1 or more: "Not sure about this one. Which is it?" (unchanged).
- `ItemForm.tsx` passes what the line needs; the three suggestion chips are unchanged.
- Tests for `decide()` and the line are updated; `(cd mobile && bunx tsc --noEmit && bun test src)` passes.

## Shipping

- Export the winner to `mobile/assets/model/`, update `docs/ml.md` ("Current model", the comparison table, Data and Commands for Carousell, the PC path), and commit on a branch.
- Build Release to the iPhone (`bunx expo run:ios --configuration Release --device 00008110-0014453E0EDB801E` from `mobile/`), then Minh checks on the phone: "Choose photo" with IMG_9019 says Trousers; a fresh "Take photo" of trousers and of a top; an unsure photo shows the best-guess line.
- Pushing to `main`: `mobile/` and `ml/` do not trigger deploys, but ask Minh before pushing, per AGENTS.md.

## Order and cut-offs

Times are 2026-10-25, local.

| By | Step | If late |
|---|---|---|
| 13:30 | This document and the plan | |
| ~16:00 | Carousell append and cleaning, evaluate changes, ExecuTorch optional, PC script, int8 export, app change, handoff for the PC | Int8 and Kaggle speed-ups are cut first |
| ~16:30 | PC set up, first run started | Run the first job on Kaggle instead |
| 21:30 | Sweep stops | Choose from what has finished |
| 22:15 | Winner exported (int8 if it passes) | Ship float |
| 23:00 | On the phone | |

Drop order if time runs short: int8, then the sweep (ship the first run), then the PC (Kaggle). The floor is Carousell + the app change + one run.

## Handoffs

The Mac session and the PC session coordinate through documents in `docs/superpowers/handoffs/`, committed on the work branch. The first, written when the Mac-side work is done, tells the PC session how to set up WSL, pull the data, start the queue, and send runs back. The PC session writes one back when the sweep ends.

## Left to the builder

- Exact sweep variants and queue length, once the first run's time is known.
- Duplicate detection method and the exact split fractions (around 60/10/30).
- Whether to sort hoodies by hand instead of dropping them.
- Script names and layout for the PC queue.
- Int8 calibration details.
