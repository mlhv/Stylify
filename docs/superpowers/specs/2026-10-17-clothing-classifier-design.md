# Clothing classifier and snap-to-add

Status: design approved, not started
Date: 2026-10-17
Roadmap item 1 in `2026-10-05-mobile-foundation-design.md` ("Future work").

## Goal

In the iPhone app, a photo of a clothing item gets its type suggested by a classifier Minh trained in PyTorch, running on the phone. The user always confirms or corrects it; nothing is saved without them.

Why: Minh wants to learn PyTorch and on-device ML, and this is the main feature of the portfolio app. A hosted model API would defeat the purpose.

Success is that it works on Minh's own photos of Minh's own clothes (see "Targets"), not a benchmark number.

Not in scope: the web app (it keeps the typed field), logging predictions, jewellery and other accessories, int8 quantisation, the Core ML backend, detecting several items in one photo. These are under "Next steps".

## Facts this design starts from

- `type` is free text: `createItemSchema` in `shared/src/index.ts` requires a non-empty string and `items.type` is `varchar(256)`. On 2026-10-13 the production database held 3 items from 2 users (`beanie`, `t-shirt`, `viet`), so there is no legacy data to migrate. `type` stays free text; the classifier only suggests values.
- The add flow: `mobile/src/lib/photo.ts` (`pickPhoto`) → `mobile/src/components/ItemForm.tsx` (`choose()` sets the photo; `type` is one of four plain `TextInput`s) → `mobile/src/lib/upload.ts` → `mobile/src/lib/api.ts`. `add.tsx` and `item/[id].tsx` both use `ItemForm`.
- Expo SDK 55, React Native 0.83.10, React 19.2.0, New Architecture, iOS deployment target 17.0, Xcode 26.3. The phone is an iPhone 13 Pro on iOS 27 with free provisioning.
- Training runs on an M1 Pro MacBook Pro (PyTorch on MPS).

## Spike results (2026-10-13)

A throwaway spike (worktree `spike-executorch`, not merged) answered whether ExecuTorch works in this app. It does.

What was run: torchvision's ImageNet-pretrained MobileNetV3-Small, exported to `.pte` with the XNNPACK partitioner, bundled as an asset, classifying a T-shirt photo on the iPhone 17 simulator.

| | Result |
|---|---|
| Native build on Xcode 26.3 | Succeeded |
| Top-1 on device | "jersey, T-shirt, tee shirt" 99.78% |
| Top-1 in PyTorch, same photo | "jersey" 99.69%, same top 5 |
| Model load | 32 ms |
| Inference | 19 ms first call, 4 ms after |
| `.pte` size | 10.2 MB (1000 classes, float32) |
| Existing app | Wardrobe screen renders; 54 mobile tests pass; typecheck clean |

What the spike established:

- **Versions.** `react-native-executorch` 0.10.5 requires `react-native-worklets` >=0.10 <0.13. SDK 55 ships worklets 0.7.4 and Reanimated 4.2.1. Worklets 0.10.4 needs Reanimated 4.4 or 4.5. The working set is `react-native-executorch` 0.10.5, `react-native-worklets` 0.10.4, `react-native-reanimated` 4.5.5, `react-native-blob-util` 0.24.12. Metro warns that these are not SDK 55's expected versions; the app built and ran. NativeWind 4.2.7 (through `react-native-css-interop` 0.2.7) accepts Reanimated >=3.6.2.
- **API (read from the installed 0.10.5 source; the published docs describe an older API).** `createClassifier({ modelPath, modelOpts })` and the `useClassifier` hook. `modelPath` is a local file path (no `file://` prefix) or an `http(s)` URL. `modelOpts` holds `labels` (length must equal the model's output size), `resizeMode` (`'stretch'`, `'letterbox'` or `'crop'`), `interpolation` and `normalizeOpts` (`{ alpha, beta }`, per channel allowed). `classify(image, { topk })` returns `[{ label, confidence }]` sorted by confidence, with softmax applied. Resize, colour conversion, layout change and normalisation run natively. The model must take `float32 [1, 3, H, W]` (or `[3, H, W]`) and return `float32 [1, N]`.
- **No image decoding.** `classify` takes `{ data: Uint8Array, width, height, format: 'rgb' | 'rgba' | ..., layout: 'hwc' }`. The spike resized the photo to 224×224 with `expo-image-manipulator`, read it as base64 and decoded it with `jpeg-js` 0.4.4 (pure JS). Resize plus decode took about 2 s in a debug build.
- **Bundling.** Adding `pte` to Metro's `resolver.assetExts` and loading with `Asset.loadAsync(require(...))` from `expo-asset` gives a local path.
- **Native libraries.** The package's `postinstall` (`scripts/download-libs.js`) downloads prebuilt ExecuTorch binaries from its GitHub release `v0.10.4-libs`. Bun blocks it. The script reads a `"react-native-executorch"` block from the `package.json` at `INIT_CWD`, then from each `package.json` above the package (in this hoisted workspace that is the root). With `{ "features": ["classification"] }` it downloads core, XNNPACK, Core ML and OpenCV: 175 MB in `node_modules`. Running it by hand with `INIT_CWD` set to `mobile/` worked.
- **Export toolchain.** Python 3.12, `torch` 2.14.1, `torchvision` 0.29.1, `executorch` 1.5.1. `torch.export.export` → `to_edge_transform_and_lower(..., partitioner=[XnnpackPartitioner()])` → `to_executorch()`. The 0.10.5 runtime loads the result. ExecuTorch's Python runtime reproduced PyTorch's output to within 4e-5.

Not tested in the spike: the physical iPhone, a release build, the Core ML backend.

## Datasets

Both are licensed for non-commercial research only and may not be redistributed. Neither the data nor anything derived from it except the trained model goes in the repo.

**DeepFashion2** (Minh has `train.zip`, `validation.zip`, `test.zip`, `json_for_validation.zip` in `~/Downloads`).

- `train.zip`: 191,962 images, each with a JSON annotation. `validation.zip`: 32,154 images with annotations. Images are stored uncompressed; the zips use ZipCrypto encryption, password from the dataset authors.
- `test.zip` has no annotations and is not used. `json_for_validation.zip` holds COCO-format validation labels for the official evaluation scripts; the per-image annotations make it unnecessary.
- Each annotation lists items with a category (13 classes), bounding box, occlusion (1 slight, 2 medium, 3 heavy), zoom, viewpoint, and a `source` of shop or user. Many images are customer photos.
- No shoes, hats, bags or accessories.

**DeepFashion-MultiModal** (https://github.com/yumingj/DeepFashion-MultiModal; images about 5.4 GB from Google Drive, not yet downloaded).

- 44,096 studio photos of models, 750×1101. 12,701 of them have human-parsing masks (24 classes).
- Counted from the masks on 2026-10-16 (a crop "usable" if its box's short side is at least 64 px):

| Class | Images | Usable | Median short side |
|---|---|---|---|
| footwear | 12,561 | 11,834 | 122 px |
| headwear | 1,765 | 1,737 | 125 px |
| bag | 1,244 | 1,125 | 131 px |
| necklace | 4,102 | 1,551 | 56 px |
| belt | 717 | 300 | 42 px |
| socks | 882 | 512 | 69 px |
| eyeglass | 527 | 6 | 37 px |
| earrings | 1,574 | 2 | 5 px |

- Every item is worn by a model in a studio. A pair of shoes on a floor, or a bag on a table, looks different; expect shoes, hats and bags to score lower than garments at first.
- Jewellery is excluded: earrings are a few pixels, and necklace crops are mostly neck and collar. The ring class (8,294 images, median 25 px) looks unreliable.

**Web shoe photos** (added 2026-10-19): Shoe-Net-10K (https://huggingface.co/datasets/prithivMLmods/Shoe-Net-10K, 10,000 images, 5 shoe types) and jhovanni/shoe-dataset (https://huggingface.co/datasets/jhovanni/shoe-dataset, `train/` and `validation/` only, 4,794 images).

- Added because every MultiModal shoe is a pair worn by a model and seen from the front, and Minh's side-on photos of a single shoe failed. Each web image is one shoe or one pair, often on its own.
- Both are web-scraped, so, like DeepFashion, they stay in `~/stylify-data` and are never committed. The two overlap, so `prepare.py` removes duplicates across both.

**Web hat and bag photos** (added 2026-10-21): the Myntra product catalogue (https://huggingface.co/datasets/benitomartin/fashion-product-images-small-384x512, bag and cap article types) and the Kaggle Headgear dataset (https://www.kaggle.com/datasets/gpiosenka/headgear-image-classification, CC0, wearable-hat classes only: baseball cap, beret, fedora, bowler, boater, pork pie, deerstalker, ascot cap, top hat).

- Added because every MultiModal hat and bag is a crop of an item on a model, and the owner's cap was called `top` at 0.85 to 0.88 confidence, above both thresholds. Same reasoning and same handling as the web shoes.

## Labels

Nine labels, in this output order:

| # | Label | Shown and saved as | DeepFashion2 categories | MultiModal classes |
|---|---|---|---|---|
| 0 | `top` | Top | short sleeve top, long sleeve top, vest, sling | (not used) |
| 1 | `outerwear` | Outerwear | short sleeve outwear, long sleeve outwear | (not used) |
| 2 | `trousers` | Trousers | trousers | (not used) |
| 3 | `shorts` | Shorts | shorts | (not used) |
| 4 | `skirt` | Skirt | skirt | (not used) |
| 5 | `dress` | Dress | short sleeve dress, long sleeve dress, vest dress, sling dress | (not used) |
| 6 | `shoes` | Shoes | (none) | footwear, plus web product photos |
| 7 | `hat` | Hat | (none) | headwear, plus web product photos |
| 8 | `bag` | Bag | (none) | bag, plus web product photos |

Garments come from DeepFashion2 only (web photos may be added for any label under `raw/web/`): its customer photos are closer to phone photos, and MultiModal's `pants` mixes trousers and shorts.

## Part 1: the model pipeline (`ml/`)

### Layout

- `ml/` is a `uv` Python project (`pyproject.toml`, `uv.lock`) on Python 3.12, pinned to `torch` 2.14.1, `torchvision` 0.29.1, `executorch` 1.5.1, plus `timm`, `pillow`, `numpy` and `pytest`. Exact versions, no ranges.
- `ml/` holds code only. It is not a Bun workspace, and the deploy workflows watch `server/`, `shared/`, `frontend/` and the root `package.json`, so changes in `ml/` deploy nothing.
- Data lives in `~/stylify-data/`, passed to every script as `--data`:

```
~/stylify-data/
  raw/deepfashion2/{train,validation}/   unzipped, deleted after prepare
  raw/multimodal/images/ and parsing/    MultiModal images and masks
  raw/web/<label>/<source>/...           web photos: shoes (shoenet, jhovanni), hat and bag (myntra, headgear)
  crops/<label>/<id>.jpg                 the crop cache
  manifest.csv
  personal/<label>/*.jpg                 Minh's own photos, never trained on
  runs/<run-id>/                         one folder per training run
```

### Getting the data

1. Unzip `train.zip` and `validation.zip` with `unzip`, which prompts for the password (fast; Python's `zipfile` decrypts ZipCrypto in pure Python). `prepare.py` needs them on every run. They need about 13 GB. `test.zip` can be deleted.
2. Download the MultiModal images and parsing masks.
3. After `prepare.py` succeeds, delete `raw/deepfashion2/`. Keep the zips, so the cache can be rebuilt if the crop rules change.
4. Photograph about 10 of Minh's own items per label into `personal/<label>/`.

### `prepare.py`

- DeepFashion2: one crop per annotated item, mapped through the label table. Items with occlusion 3 are skipped.
- MultiModal: for footwear, headwear and bag, the box is the bounding box of that class's pixels in the parsing mask. Boxes under 64 px on the short side are skipped.
- Web photos: the folder under `raw/web/` names the label (it must be one of the nine, or `prepare.py` stops with an error; names starting with `.` are skipped). Every image under `raw/web/<label>/` (jpg, jpeg, png, webp; sorted path order) is one crop of the whole image, with no widening. Images under 64 px on the short side are skipped. Duplicates across all of `raw/web/`, whatever the label, are removed by a 64-bit difference hash (the first image in path order is kept). The split is 85/15 by that hash, and `group` is `web:<hash>`.
- Every DeepFashion2 and MultiModal box is widened by 10% on each side (clamped to the image), cropped, resized so the long side is 256 px, and saved as JPEG quality 90. Web photos (any label) are used whole, then resized and saved the same way.
- `manifest.csv` columns: `path, label, source (df2|mm|web), split (train|val), group (item ID), origin (shop|user|studio|web)`.
- Splits: DeepFashion2 keeps its own train and validation split. Its `pair_id` numbering is separate in each split, so `group` is `df2:<split>:<pair_id>`. MultiModal is split 85/15 by item ID, parsed from the file name (for example `id_00000080`; confirm the format once the images are downloaded), with `group` `mm:<item ID>`, so one product's photos never appear on both sides.
- Balance: at most 8,000 training crops per garment label, chosen at random with a fixed seed. Validation is not capped. Shoes, hats and bags are capped per (label, source): at most 4,000 training crops from MultiModal and 4,000 from web photos for each, so about half the shoes are on feet and half are not.
- Inputs are checked before anything is deleted: `raw/deepfashion2/{train,validation}/annos`, `raw/multimodal/parsing` and the `raw/web/<label>` folder names. A missing folder or unknown label raises an error and leaves `crops/` and `manifest.csv` as they were.
- MultiModal bag boxes narrower than 0.4 of their height (`BAG_MIN_ASPECT`) are dropped as slivers at the frame edge.
- The script prints counts per label, source and split.

### `train.py`

- `--model` is one of `mobilenet_v3_large`, `efficientnet_b0` (torchvision) or `mobilenetv4_conv_medium` (`timm`). Pretrained ImageNet weights; the final layer is replaced with a 9-output layer.
- Phase 1: only the new layer trains (starting values: 3 epochs, learning rate 1e-3). Phase 2: the whole network (starting values: 12 epochs, learning rate 1e-4). AdamW, cosine schedule, label smoothing 0.1, batch size 64, device MPS. All of these are flags, recorded in `config.json`.
- Sampling: a weighted sampler draws each label equally often.
- Augmentation: random resized crop (scale 0.6 to 1.0), horizontal flip, mild colour jitter. Every training and evaluation image ends as a **stretched 224×224 resize** with ImageNet normalisation, matching the app's `resizeMode: 'stretch'`.
- Keeps the checkpoint with the best balanced accuracy (mean per-label recall) on validation.
- Writes `config.json`, per-epoch metrics and `best.pt` to `runs/<run-id>/`.

### `evaluate.py`

- Scores a run on validation and on `personal/`: per-label precision and recall, confusion matrix, top-1 and top-3 accuracy, balanced accuracy.
- Threshold: the smallest `t` such that, among validation crops whose top-1 confidence is at least `t`, the top-1 label is correct for at least 95%. Validation is reweighted so every label counts equally. If no `t` reaches 95%, the threshold is 1.0 (never pre-fill). Stored with the run.
- `--compare` prints one table across runs: model, size, the scores above, the threshold.

### Choosing the model

Train all three candidates on the same data and splits. The winner has the best top-1 on `personal/` among models whose `.pte` is 20 MB or less, with balanced validation accuracy as the tie-break. If `mobilenetv4_conv_medium` does not export cleanly, it is dropped and recorded as such.

### `export.py`

- Exports a run's `best.pt` to `classifier.pte` as in the spike (XNNPACK, float32, input `[1, 3, 224, 224]`, output `[1, 9]`).
- Runs the `.pte` through ExecuTorch's Python runtime on a batch of validation crops and fails if any logit differs from PyTorch's by more than 1e-3.
- Writes `classifier.json`:

```json
{
  "labels": ["top", "outerwear", "trousers", "shorts", "skirt", "dress", "shoes", "hat", "bag"],
  "inputSize": 224,
  "resizeMode": "stretch",
  "normalize": { "mean": [0.485, 0.456, 0.406], "std": [0.229, 0.224, 0.225] },
  "threshold": 0.0,
  "model": "efficientnet_b0",
  "run": "<run-id>",
  "exportedAt": "<date>",
  "scores": { "valBalancedAccuracy": 0.0, "personalTop1": 0.0, "personalTop3": 0.0 }
}
```

- `--placeholder` exports an untrained 9-output model with `threshold` 1.0, so the app can be built before training finishes.
- Output goes to `mobile/assets/model/`. Both files are committed. If retraining becomes frequent, move the `.pte` to Git LFS.

### Targets

Reported, not enforced:

| Measure | Target |
|---|---|
| Balanced accuracy, validation | ≥ 85% |
| Top-1, personal photos | ≥ 80% |
| Top-3, personal photos | ≥ 95% |
| `.pte` size | ≤ 20 MB |

### Tests (`pytest`, in `ml/`)

- Label mapping for every DeepFashion2 and MultiModal class, including the ones dropped.
- Box from a parsing mask, including the 10% widening and clamping, on a synthetic mask.
- No `group` appears in both splits of a manifest.
- Export parity on a tiny model.

## Part 2: the app (`mobile/`)

### Dependencies and native setup

- Exact versions: `react-native-executorch` 0.10.5, `react-native-worklets` 0.10.4, `react-native-reanimated` 4.5.5, `react-native-blob-util` 0.24.12, `jpeg-js` 0.4.4. `@kesha-antonov/react-native-background-downloader` is an optional peer and is not added (the model is bundled).
- `mobile/package.json` gets `"react-native-executorch": { "features": ["classification"] }` and a `postinstall` script that runs the library's `scripts/download-libs.js` with `INIT_CWD` set to `mobile/`. The root `package.json` is not changed, so nothing deploys.
- To verify in the plan's first task: that root `bun install` runs the `mobile/` `postinstall`; that the filtered server and web installs (`--filter server`, `--filter frontend`, `--omit=peer`) do not; that the Docker image still has about 57 packages.
- `mobile/metro.config.js` adds `pte` to `resolver.assetExts`.
- Then `bunx expo prebuild -p ios --clean` and reinstall (`docs/mobile.md`, "On an iPhone").

### `mobile/src/lib/classify.ts`

- `classifyPhoto(uri: string): Promise<{ label: Label; confidence: number }[]>` returns the top 3.
- Loads `assets/model/classifier.pte` through `expo-asset` and creates the classifier on first use, then reuses it (one module-level promise). Labels, normalisation (converted to `alpha = 1 / (255 · std)`, `beta = −mean / std`) and `resizeMode` come from `classifier.json`.
- Image path: `ImageManipulator.manipulate(uri).resize({ width: 224, height: 224 })` → JPEG with base64 → `jpeg-js` decode → `{ format: 'rgba', layout: 'hwc' }`.
- **Open risk:** decode speed. Measured in a release build on the phone; if photo-to-suggestion takes more than 300 ms, replace the decode with a native one (for example `@shopify/react-native-skia`'s `readPixels`), chosen in the plan.

### `mobile/src/lib/suggestion.ts` (pure, unit-tested)

```ts
type Prediction = { label: Label; confidence: number }
type Decision = { prefill: string | null; chips: string[] }

decide(predictions: Prediction[], threshold: number, currentType: string, lastPrefill: string | null): Decision
```

- `chips`: the display names of the top 3, in order.
- `prefill`: the top display name when its confidence ≥ `threshold` **and** `currentType` is empty or equals `lastPrefill`. Otherwise `null`. A type the user typed or picked is never overwritten.
- Display names: `Top, Outerwear, Trousers, Shorts, Skirt, Dress, Shoes, Hat, Bag`. The saved `type` is the display name.

### `ItemForm` changes

- After `choose()` gets a photo, `classifyPhoto` starts without blocking the form. Under the type field, "Identifying…" shows until it finishes.
- On success, `decide` runs: the pre-fill is written through the form field (so validation runs), and the chips appear under the type field. Tapping a chip sets the field.
- Choosing another photo starts again; a result from an earlier photo is ignored.
- On any failure the error is logged with `console.warn`, nothing is shown, and the form works as it does today.
- The edit screen gets the same behaviour through the shared form: it classifies only when a new photo is chosen, and the `currentType` rule keeps the saved type.

### Tests (`bun test` in `mobile/`)

- `decide`: below and above the threshold; an empty field, a field holding the last pre-fill, a field the user changed; fewer than 3 predictions.
- `classifier.json` labels equal the app's label list in order, so a retrained model with a different order fails the tests instead of mislabelling.

## Build order

Two plans that meet at the contract `classifier.pte` plus `classifier.json`:

- **Plan A, model:** `ml/` project, data preparation, training, evaluation, comparison, export. Starts with getting the data and Minh's personal photos.
- **Plan B, app:** dependencies and native setup, `classify.ts`, `suggestion.ts`, `ItemForm`, against the `--placeholder` model (equal confidence for every label, so chips only). Then swap in the real model.

The plans are independent and can run in either order or in parallel. Plan B needs only `export.py --placeholder` from Plan A, which can be written first.

## Verification on the phone

- A release build installed from Xcode.
- One fresh photo per label (not from `personal/`): pre-fill and chips follow the rules; a typed type is never overwritten; editing an item and choosing a new photo keeps its type.
- Recorded: photo-to-suggestion time, model load time, and the app's size before and after.
- Sign in, add, edit, delete, sign out still work. Screens with animation (tab bar, navigation) are checked, since Reanimated and worklets changed versions.

## Docs

- New `docs/ml.md`: the datasets and where to get them, the licence limits, the `~/stylify-data/` layout, each command, how to retrain and ship a model, and the comparison results.
- `AGENTS.md`: `ml/` in the layout and commands; "datasets and crops never go in the repo"; worklets and Reanimated are intentionally ahead of SDK 55's expected versions, so `expo install --fix` must not be run on them; the `mobile/` `postinstall` downloads ExecuTorch binaries.
- `docs/mobile.md`: the native download step and the model assets.

## Next steps (not in this spec)

1. **Log predictions.** A nullable `predictedType` column on `items`, set from the top prediction when an item is saved. `predictedType` vs `type` shows every correction, and the saved photos in S3 become retraining data. Needs a migration, a `createItemSchema` change and an API deploy; the web app sends nothing for it.
2. **Jewellery and accessories,** trained from Minh's own photos.
3. **Int8 quantisation** (XNNPACK quantizer) to shrink the model about 4×, and the **Core ML backend** for the Neural Engine. Each needs its own accuracy check.
4. **Several items in one photo** with a detector (DeepFashion2 has the boxes).

## Clean-up

The spike worktree (`.claude/worktrees/spike-executorch`, branch `worktree-spike-executorch`) is removed after this spec is committed; its results are recorded above. The iPhone 17 simulator still has the spike build installed; `bunx expo run:ios --device "iPhone 17"` from `mobile/` on `main` restores the normal app.
