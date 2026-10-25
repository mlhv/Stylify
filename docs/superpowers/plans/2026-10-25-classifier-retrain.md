# Classifier Retrain (Room Photos) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Carousell marketplace photos to training, run a sweep on Minh's RTX 5070 (WSL2), ship the best model (int8 if it holds up) and an app that always offers its best guess, by 23:00 on 2026-10-25.

**Architecture:** A new `append_carousell` step adds Carousell rows to the existing crop cache and manifest without a DeepFashion2 rebuild. `train` gains per-source oversampling and a stronger augmentation option; `evaluate` gains Carousell held-out halves, a combined and capped threshold, an optional `room/` set and a baseline guard in `--compare`. A restartable job queue runs the sweep on the PC; `export` gains int8. The mobile change is confined to `decide()` and the line under the Type field.

**Tech Stack:** Python 3.12 with uv, PyTorch 2.14.1, torchvision 0.29.1, ExecuTorch 1.5.1 (XNNPACK), pytest; Expo SDK 55 app in TypeScript with `bun:test`.

**Spec:** `docs/superpowers/specs/2026-10-25-classifier-retrain-design.md`

## Global Constraints

- Labels stay `top, outerwear, trousers, shorts, skirt, dress, shoes, hat, bag` in that order; input 224, `resizeMode: "stretch"`, ImageNet mean/std. `mobile/src/lib/classifierConfig.ts` rejects any change.
- `.pte` ≤ 20 MB.
- Shoe, hat or bag recall on validation may drop at most 2 points (0.02) against the shipped run `20261022-180946-efficientnet_b0`.
- Nothing under `~/stylify-data/` goes in the repo or anywhere public. Kaggle datasets stay private. `~/Downloads/IMG_9018`–`9021.HEIC` are read in place only.
- A trained model's threshold is at most 0.99; only `export --placeholder` writes 1.0.
- Work on branch `ml/room-retrain`. Pushing that branch is approved; pushing `main` needs Minh's say-so.
- Every new `stylify_ml` module that `train`/`evaluate` import must work without ExecuTorch installed.
- Copy (exact): above threshold `Ooh, that looks like ${guess}!`; below with pre-fill `My best guess is ${guess}. Tap another if it's not.`; below without pre-fill `My best guess is ${guess}.`; threshold ≥ 1 `Not sure about this one. Which is it?`.
- Cut-offs: handoff to the PC by about 16:00; sweep stops 21:30; app on the phone by 23:00. Drop order if late: int8 (Task 7), then the sweep (ship the first run), then the PC (use Kaggle).

## Review Focus

- Running `append_carousell` twice, or after a `prepare`, must leave exactly one copy of every Carousell row and file and no other row touched. Test in Task 1.
- A manifest with no Carousell rows (old runs, or Kaggle bundles made before Task 2) must still evaluate, compare and export; threshold falls back to usersVal alone. Tests in Task 3.
- `evaluate --compare` over old `metrics.json` files that lack the new keys must print `-`, not crash. Test in Task 3.
- The queue restarted after a crash or a sleep mid-run must not lose finished runs and must not stall on the half-written run directory. Test in Task 5.
- Corrupt, tiny, PNG or CMYK Carousell images must be skipped or converted, never crash the append. Test in Task 1.

---

### Task 1: `append_carousell`: Carousell into the crop cache

**Files:**
- Create: `ml/stylify_ml/append_carousell.py`
- Create: `ml/stylify_ml/carousell_overrides.csv` (header `image,label`, no rows yet)
- Modify: `ml/stylify_ml/manifest.py` (docstring of `Row.source`: add `"carousell"`)
- Test: `ml/tests/test_append_carousell.py`

**Interfaces:**
- Consumes: `prepare._open_rgb`, `prepare.dhash`, `prepare.read_overrides`, `prepare._write_crops`, `prepare._Pending`, `manifest.read_manifest`/`write_manifest`/`Row`, `manifest.mm_split`'s hashing idea.
- Produces:
  - `CAROUSELL_CLASS_TO_LABEL: dict[str, str | None]` (`Hoodie` → `None`).
  - `carousell_split(group: str) -> str`: `"train"` / `"val"` / `"test"` from the sha256 position of `f"carousell:{group}"`: < 0.60 train, < 0.70 val, else test.
  - `near_duplicate_groups(hashes: list[str], max_distance: int = 6) -> list[str]`: for each hash, its group id (the smallest hash in its cluster under Hamming distance ≤ `max_distance`, clustered transitively).
  - `append_carousell(data: Path, min_side: int = 64) -> dict[str, int]`: counts of added rows per label and skip reasons.
  - Rows: `path=f"crops/{label}/carousell-{split}-{digest}.jpg"`, `source="carousell"`, `group=f"carousell:{group_hash}"`, `origin="user"`.
  - CLI: `python -m stylify_ml.append_carousell --data ~/stylify-data`.

Mapping (from the spec): Kaos, Kemeja, Polo, Sweter → `top`; Blazer, Jaket, Jaket_Denim, Jaket_Olahraga, Mantel → `outerwear`; Celana_Panjang, Jeans → `trousers`; Celana_Pendek → `shorts`; Rok → `skirt`; Gaun → `dress`; Hoodie → dropped. An unknown class folder is an error. Overrides are keyed by `<Class>/<filename>` with label or `drop`.

- [ ] **Step 0: Move the download into place** (not code; Mac only)

```bash
mkdir -p ~/stylify-data/raw/carousell
mv /private/tmp/claude-501/-Users-ml3787-Stylify/802b4d97-b079-4dcd-9451-da9223061a6d/scratchpad/dl/carousell/Clothes_Dataset ~/stylify-data/raw/carousell/
ls ~/stylify-data/raw/carousell/Clothes_Dataset | wc -l   # 15
```

If the scratchpad copy is gone, re-download: `uvx kaggle datasets download ryanbadai/clothes-dataset -p ~/stylify-data/raw/carousell --unzip`.

- [ ] **Step 1: Write the failing tests**, building a fake `data/raw/carousell/Clothes_Dataset/<Class>/` tree with small solid-colour and patterned images and a fake existing manifest with one `df2` train row:
  - `test_maps_classes_and_drops_hoodie`: Kaos → `top`, Mantel → `outerwear`, Jeans → `trousers`, Gaun → `dress`; Hoodie images produce no rows.
  - `test_unknown_class_folder_is_an_error`: a folder `Topi/` raises `ValueError` naming it.
  - `test_overrides_relabel_and_drop`: with a monkeypatched overrides path containing `Kaos/a.jpg,dress` and `Rok/b.jpg,drop`, a.jpg is a `dress` row and b.jpg has no row.
  - `test_split_is_stable_and_roughly_60_10_30`: `carousell_split` gives the same answer twice; over 5,000 synthetic groups the train/val/test shares are within 0.03 of 0.60/0.10/0.30.
  - `test_near_duplicates_share_group_and_split`: `near_duplicate_groups(["0000000000000000", "0000000000000003", "ffffffffffffffff"])` returns the same group for the first two and a different one for the third.
  - `test_rerun_is_idempotent_and_keeps_other_rows`: running twice gives the same manifest (same rows, same order of non-Carousell rows first) and the same set of `crops/*/carousell-*.jpg` files; the `df2` row is untouched; `manifest-pre-carousell.csv` exists and equals the original manifest.
  - `test_skips_unreadable_and_small_and_converts_modes`: a 0-byte `.jpg`, a 20×20 image and a CMYK image: the first two are counted as skipped, the CMYK one becomes an RGB crop with long side 256.

- [ ] **Step 2: Run them to see them fail**

Run: `cd ml && uv run pytest tests/test_append_carousell.py -v`
Expected: FAIL, `ModuleNotFoundError: stylify_ml.append_carousell`.

- [ ] **Step 3: Implement `append_carousell.py`.** Read all images first, compute `dhash` per image, drop exact duplicates (same hash: first in sorted path order wins), cluster with `near_duplicate_groups`, split by group, then remove old `carousell` rows and `crops/*/carousell-*.jpg`, write new crops with `_write_crops`, append rows after the non-Carousell rows, write the manifest. Copy `manifest.csv` to `manifest-pre-carousell.csv` only if that file does not exist. Print a per-label/per-split table like `prepare` does. Near-duplicate clustering over ~7,500 64-bit hashes: pairwise XOR + popcount with numpy (`np.unpackbits` on uint64 viewed as uint8) in chunks, then union-find.

- [ ] **Step 4: Run the tests**

Run: `cd ml && uv run pytest tests/test_append_carousell.py -v`
Expected: all PASS. Then `uv run pytest` (whole suite) PASS.

- [ ] **Step 5: Commit**

```bash
git add ml/stylify_ml/append_carousell.py ml/stylify_ml/carousell_overrides.csv ml/stylify_ml/manifest.py ml/tests/test_append_carousell.py
git commit -m "feat(ml): append the Carousell photos to the crop cache"
```

### Task 2: Clean Carousell and append it for real

**Files:**
- Modify: `ml/stylify_ml/carousell_overrides.csv`
- Create (scratchpad only, not committed): a contact-sheet script

**Interfaces:**
- Consumes: Task 1's CLI and overrides format (`<Class>/<filename>,<label|drop>`).
- Produces: `~/stylify-data/manifest.csv` with Carousell rows; `crops/*/carousell-*.jpg`.

- [ ] **Step 1: Make contact sheets** of every image per class (about 100 per sheet, filename under each thumbnail), in the session scratchpad. Look at each sheet.
- [ ] **Step 2: Add overrides** for collages, large sticker or text overlays, non-clothing, and wrong labels (relabel where clearly another of our six labels, else `drop`). Mannequin shots stay. Time box: 45 minutes in total; stop at the time box even if not every sheet is done, and note in the commit message which classes were checked.
- [ ] **Step 3: Run the append**

Run: `cd ml && uv run python -m stylify_ml.append_carousell --data ~/stylify-data`
Expected: about 6,500–7,000 rows added (7,500 less 500 hoodies, duplicates and drops); every garment label has train, val and test rows; `wc -l ~/stylify-data/manifest.csv` is 120,259 plus the added rows.

- [ ] **Step 4: Commit**

```bash
git add ml/stylify_ml/carousell_overrides.csv
git commit -m "data(ml): Carousell overrides from a spot check of <classes>"
```

### Task 3: Evaluate: Carousell halves, combined capped threshold, room set, guarded compare

**Files:**
- Modify: `ml/stylify_ml/evaluate.py`
- Modify: `ml/stylify_ml/data.py` (`load_personal` → generalised loader)
- Modify: `ml/stylify_ml/export.py` (`_export_run` scores, so `classifier.json` carries the new scores)
- Test: `ml/tests/test_train_evaluate.py`, `ml/tests/test_data.py`

**Interfaces:**
- Consumes: Task 1's `source="carousell"` rows with `split="test"`.
- Produces:
  - `load_folder(data: Path, name: str) -> list[tuple[Path, int]]` in `data.py`; `load_personal(data)` stays as `load_folder(data, "personal")`.
  - `carousell_half(group: str) -> str`: `"carousellVal"` or `"carousell"`, 50/50 by `mm_split(f"carousell-val:{group}", 0.5)`.
  - `users_half` is applied only to `source == "clothing"` test rows (today it is applied to every test row).
  - `metrics.json` gains `"carousellVal"`, `"carousell"`, `"room"` (each a `summarise` dict or `null`), `"thresholdCapped": bool`; `"thresholdFrom"` becomes `"usersVal+carousellVal"`, `"usersVal"` or `"val"`.
  - `MAX_TRAINED_THRESHOLD = 0.99`.
  - `compare(data: Path, baseline: str | None = None) -> str` with columns: run, model, val bacc, users top1, carousell top1, mean top1, users top3, personal top1, room top1, shoes/hat/bag val recall (as `0.98/0.97/0.95`), threshold, .pte MB, and with a baseline a final column `ok` / `acc-drop` / `too-big`, plus a last line `winner: <run>` (best mean top1 among `ok` rows, tie-break val bacc; the baseline itself is eligible).
  - CLI: `evaluate --compare [--baseline <run-id>]`.
  - `classifier.json` `scores` gains `carousellTop1`, `carousellTop3`.

- [ ] **Step 1: Write the failing tests** (extend `_fake_data` with an optional Carousell part: for each label one `carousell` test row in each half, and one `room/<label>/r.jpg`):
  - `test_users_ignore_carousell_rows`: `metrics["users"]["n"]` equals the number of `clothing`/`df2` test rows only (in the fixture, the existing `df2` test rows count as users, as today).
  - `test_carousell_halves_reported`: `metrics["carousell"]["n"] + metrics["carousellVal"]["n"]` equals the Carousell test rows; `thresholdFrom == "usersVal+carousellVal"`.
  - `test_threshold_without_carousell_falls_back`: on the old fixture, `thresholdFrom == "usersVal"` and `metrics["carousell"] is None`.
  - `test_threshold_is_capped`: monkeypatch `evaluate_module.pick_threshold` to return 1.0; `metrics["threshold"] == 0.99` and `metrics["thresholdCapped"] is True`.
  - `test_room_folder_scored_when_present`: `metrics["room"]["n"] == 9`; without the folder, `metrics["room"] is None`.
  - `test_compare_old_metrics_prints_dashes`: a run whose `metrics.json` lacks `carousell`, `room` and `thresholdCapped` shows `-` in those columns (patch `_pte_bytes` to return 1e6, as the existing compare test does).
  - `test_compare_baseline_guard_and_winner`: two runs with hand-written `metrics.json`: baseline shoes recall 0.99, candidate 0.96 and higher mean top1 → candidate `acc-drop`, `winner: <baseline>`; candidate 0.98 → candidate `ok` and `winner: <candidate>`.
  - In `test_data.py`: `test_load_folder_rejects_unknown_label` for `room/socks/`.

- [ ] **Step 2: Run them to see them fail**

Run: `cd ml && uv run pytest tests/test_train_evaluate.py tests/test_data.py -v`
Expected: the new tests FAIL (KeyError `carousell`, unexpected keyword `baseline`, …).

- [ ] **Step 3: Implement.** Threshold: concatenate usersVal and carousellVal probabilities/targets when both exist, else whichever exists, else val; `min(pick_threshold(...), MAX_TRAINED_THRESHOLD)`. Recall drop is `baseline - candidate > 0.02` on any of shoes/hat/bag from `metrics["val"]["per_label"]`; size is `_pte_bytes > 20_000_000`.

- [ ] **Step 4: Run the tests**

Run: `cd ml && uv run pytest -v`
Expected: all PASS.

- [ ] **Step 5: Re-evaluate the shipped run on the new manifest** (Mac, about 15–30 minutes on MPS; may run in the background while Task 4 is done)

Run: `cd ml && caffeinate -i uv run python -m stylify_ml.evaluate --data ~/stylify-data --run ~/stylify-data/runs/20261022-180946-efficientnet_b0`
Expected: users top-1 about 0.89 (as in `docs/ml.md`), a carousell top-1 printed, threshold ≤ 0.99.

- [ ] **Step 6: Commit**

```bash
git add ml/stylify_ml/evaluate.py ml/stylify_ml/data.py ml/stylify_ml/export.py ml/tests/
git commit -m "feat(ml): score Carousell and room photos, cap the threshold, guard compare with a baseline"
```

### Task 4: Train: per-source oversampling and strong augmentation

**Files:**
- Modify: `ml/stylify_ml/data.py` (`balanced_sampler`, `train_transform`)
- Modify: `ml/stylify_ml/train.py` (flags and `config.json`)
- Test: `ml/tests/test_data.py`, `ml/tests/test_train_evaluate.py`

**Interfaces:**
- Produces:
  - `balanced_sampler(dataset: ManifestDataset, source_weights: dict[str, float] | None = None) -> WeightedRandomSampler`. Each label still gets an equal share of samples; within a label, a row's weight is `w(source) / sum of w(source) over that label's rows`, where `w` defaults to 1.
  - `train_transform(strength: str = "default") -> Callable`; `"default"` is today's; `"strong"` is `Resize((256,256))`, `RandomResizedCrop(256, scale=(0.35, 1.0))`, `RandomHorizontalFlip()`, `RandomRotation(15)`, `ColorJitter(0.3, 0.3, 0.2, 0.02)`, then `eval_transform()`, then `RandomErasing(p=0.25)` on the tensor.
  - `train(..., source_weights: dict[str, float] | None = None, augment: str = "default")`, both recorded in `config.json` (`"source_weights"`, `"augment"`).
  - CLI: `--source-weight carousell=4` (repeatable, `name=float`), `--augment {default,strong}`.

- [ ] **Step 1: Write the failing tests**
  - `test_sampler_keeps_labels_balanced_with_source_weights`: dataset rows: label `top` with 90 `df2` and 10 `carousell`, label `dress` with 50 `df2`; with `{"carousell": 9}` the `top` rows' total weight equals the `dress` rows' total weight, and the 10 Carousell rows together carry half of `top`'s weight.
  - `test_sampler_default_unchanged`: without weights, every row's weight is `1 / count(label)` (today's behaviour).
  - `test_strong_transform_shape`: `train_transform("strong")(Image.new("RGB", (300, 200)))` has shape `(3, 224, 224)`; `train_transform("bogus")` raises `ValueError`.
  - `test_train_records_source_weights_and_augment`: in the tiny e2e run, called with `source_weights={"carousell": 3}` and `augment="strong"`, `config.json` holds both.
  - `test_parse_source_weight`: `--source-weight carousell=4 --source-weight web=0.5` → `{"carousell": 4.0, "web": 0.5}`; `carousell` without `=` is a parser error.

- [ ] **Step 2: Run them to see them fail**

Run: `cd ml && uv run pytest tests/test_data.py tests/test_train_evaluate.py -v`
Expected: the new tests FAIL.

- [ ] **Step 3: Implement** the signatures above.

- [ ] **Step 4: Run the whole suite**

Run: `cd ml && uv run pytest -v`
Expected: all PASS, including `test_train_and_evaluate_import_without_executorch`.

- [ ] **Step 5: Commit**

```bash
git add ml/stylify_ml/data.py ml/stylify_ml/train.py ml/tests/
git commit -m "feat(ml): oversample a source within each label, and a strong augmentation option"
```

### Task 5: PC path: optional ExecuTorch, job queue, setup and sync scripts, handoff

**Files:**
- Modify: `ml/pyproject.toml`, `ml/uv.lock`
- Modify: `ml/tests/test_export.py` and any test importing `stylify_ml.export` at module level (`pytest.importorskip("executorch")`)
- Create: `ml/stylify_ml/queue.py`
- Create: `ml/sweeps/first.json`, `ml/sweeps/sweep.json`
- Create: `ml/scripts/pc_setup.sh`, `ml/scripts/pc_send_runs.sh`
- Create: `docs/superpowers/handoffs/2026-10-25-pc-training-handoff.md`
- Test: `ml/tests/test_queue.py`

**Interfaces:**
- Consumes: Task 4's `train` CLI flags; Task 3's `evaluate` CLI.
- Produces:
  - `pyproject.toml`: `executorch==1.5.1` moves to `[dependency-groups] export`, and `[tool.uv] default-groups = ["dev", "export"]`, so the Mac's `uv sync`/`uv run` are unchanged and the PC uses `uv sync --no-group export`.
  - Job file format (JSON list): `{"run_id": str, "args": [str, ...]}`; `args` are passed to `stylify_ml.train` after `--data <data> --run-id <run_id>`.
  - `run_queue(data: Path, jobs: list[dict], stop_at: datetime | None, runner: Callable[[list[str], Path], int] = subprocess_runner) -> list[str]` in `queue.py`: for each job in order: skip if `runs/<run_id>/metrics.json` exists; if `runs/<run_id>/` exists without `metrics.json` but with `best.pt`, run only `evaluate`; if it exists without `best.pt`, move it to `runs/_failed/<run_id>-<UTC timestamp>/` and train again; do not start a job if `stop_at` is set and `now + duration of the longest finished job this session > stop_at`. Each command's stdout/stderr goes to `<data>/logs/<run_id>.log`. Returns the run ids finished this call.
  - CLI: `python -m stylify_ml.queue --data ~/stylify-data --jobs sweeps/sweep.json [--stop-at 21:30]` (local time today).
  - `pc_setup.sh <mac-user>@<mac-host>`: checks `nvidia-smi`; installs uv if missing; `uv sync --no-group export`; checks `torch.cuda.is_available()` and prints the GPU name and compute capability, failing if not available or if a tiny CUDA matmul fails; `rsync -a --info=progress2` of `~/stylify-data/{crops,manifest.csv,personal}` and `runs/20261022-180946-efficientnet_b0/metrics.json` from the Mac to `~/stylify-data/` on WSL's disk; prints counts to compare with the Mac.
  - `pc_send_runs.sh <mac-user>@<mac-host>`: `rsync -a ~/stylify-data/runs/ <mac>:stylify-data/runs/ --exclude _failed`.

`ml/sweeps/first.json`: one job, `efficientnet_b0`, today's settings plus `--source-weight carousell=4`, `--workers` 8, run id `<date>-pc-effb0-cw4`.
`ml/sweeps/sweep.json`: the first job plus, in this order (most informative first, so a cut at 21:30 loses the least): carousell weight 2 and 8; `--augment strong` with weight 4; `--full-lr 2e-4` with weight 4; `--full-epochs 18` with weight 4; `mobilenet_v3_large` with weight 4. The PC session may reorder or trim once the first run's duration is known.

- [ ] **Step 1: Write the failing tests** with a fake `runner` that records commands and creates `best.pt`/`metrics.json` as a real run would:
  - `test_skips_finished_runs`: a job whose `metrics.json` exists is not run.
  - `test_evaluates_run_with_checkpoint_only`: a run dir with `best.pt` only gets just the evaluate command.
  - `test_moves_half_written_run_aside`: a run dir with only `config.json` is moved under `runs/_failed/` and the job is trained again.
  - `test_stop_at_skips_jobs_that_cannot_finish`: with a fake clock where the first job takes 2 h and `stop_at` is 1 h after it ends, the second job is not started and is not in the returned list.
  - `test_failed_job_does_not_stop_the_queue`: runner returns non-zero for job 1; job 2 still runs; job 1 is reported as failed in the log and the summary.
  - `test_job_files_are_valid`: every job in `sweeps/*.json` has a unique `run_id` and its args parse with `train`'s argument parser (expose `train.build_parser()`).

- [ ] **Step 2: Run them to see them fail**

Run: `cd ml && uv run pytest tests/test_queue.py -v`
Expected: FAIL, `ModuleNotFoundError: stylify_ml.queue`.

- [ ] **Step 3: Implement** `queue.py`, `train.build_parser()`, the job files and the dependency-group change; `uv lock`.

- [ ] **Step 4: Check the PC install shape on the Mac**

Run: `cd ml && uv sync --no-group export && uv run --no-group export pytest -q; uv sync`
Expected: export tests skipped, everything else PASS; the final `uv sync` restores ExecuTorch.

- [ ] **Step 5: Write the scripts and the handoff.** The handoff (for a Claude Code session in WSL that has never seen this repo) covers, in order: what Minh does first (Windows sleep off while training; Remote Login on the Mac; the Mac's user and IP from System Settings → General → Sharing); `git clone` and `git switch ml/room-retrain`; `ml/scripts/pc_setup.sh`; run `sweeps/first.json` with `--stop-at 21:30`, note its duration, then size and run `sweeps/sweep.json` (already-finished runs are skipped); `pc_send_runs.sh` after each finished run, so the Mac can compare as they land; never commit or upload data; what to write back (a short handoff in the same folder: runs finished, durations, anything odd), committed and pushed to `ml/room-retrain`. Fallback if WSL cannot reach the Mac or the GPU check fails: stop and tell Minh; the Mac session will move the first run to Kaggle (`docs/ml.md` "Training on Kaggle").

- [ ] **Step 6: Run the whole suite, commit and push the branch**

```bash
cd ml && uv run pytest -q
git add ml/ docs/superpowers/handoffs/2026-10-25-pc-training-handoff.md
git commit -m "feat(ml): restartable training queue and the WSL path for the gaming PC"
git push -u origin ml/room-retrain
```

Then tell Minh the PC can start.

### Task 6: App: always offer the best guess

**Files:**
- Modify: `mobile/src/lib/suggestion.ts`
- Modify: `mobile/src/components/ClassifierLine.tsx`
- Modify: `mobile/src/components/ItemForm.tsx:111-135, 225`
- Test: `mobile/src/lib/suggestion.test.ts`

**Interfaces:**
- Produces:
  - `export type LineKind = 'sure' | 'guessFilled' | 'guess' | 'unsure'`
  - `export type Decision = { prefill: string | null; chips: string[]; line: LineKind; guess: string | null }` (`guess` is the top label's display name, or null when there are no predictions).
  - `decide(predictions, threshold, currentType, lastPrefill): Decision`. `threshold >= 1` or no predictions → no pre-fill, `line: 'unsure'`. Otherwise pre-fill the top guess whenever the field is open (rule unchanged), and `line` is `'sure'` if top confidence ≥ threshold, else `'guessFilled'` if it pre-filled, else `'guess'`.
  - `lineText(line: LineKind, guess: string | null): string` in `suggestion.ts`, returning the exact copy in Global Constraints.
  - `ClassifierLine` props become `{ pending: boolean; hasChips: boolean; line: LineKind; guess: string | null }`; it renders `lineText(line, guess)`.

- [ ] **Step 1: Update the tests in `suggestion.test.ts`**
  - The existing "no pre-fill below the threshold" test becomes `'pre-fills an empty field below the threshold as a best guess'`: `decide(p, 0.95, '', null)` equals `{ prefill: 'Shoes', chips: ['Shoes', 'Bag', 'Hat'], line: 'guessFilled', guess: 'Shoes' }`.
  - `'above the threshold is sure'`: `decide(p, 0.8, '', null).line === 'sure'`.
  - `'below the threshold with a saved type is a plain guess'`: `decide(p, 0.95, 'Sneakers', null)` → `prefill: null, line: 'guess'`.
  - `'sure even when the field is not open'`: `decide(p, 0.8, 'Sneakers', null).line === 'sure'`.
  - `'threshold 1 never pre-fills'`: `decide(p, 1, '', null)` → `prefill: null, line: 'unsure'`.
  - `'replaces its own earlier guess below the threshold'`: `decide(p, 0.95, 'Hat', 'Hat').prefill === 'Shoes'`.
  - `lineText`: each of the four kinds with guess `'Shorts'` gives the exact copy.
  - Keep the existing keeps-a-saved-type and keeps-a-changed-type tests (prefill null).

- [ ] **Step 2: Run them to see them fail**

Run: `cd mobile && bun test src/lib/suggestion.test.ts`
Expected: FAIL on the new expectations.

- [ ] **Step 3: Implement** `decide`, `lineText`, the new `ClassifierLine` props, and in `ItemForm.tsx` replace the `sureGuess` state and its local "sure" computation with state holding `{ line, guess }` from `decide()`.

- [ ] **Step 4: Typecheck and test**

Run: `cd mobile && bunx tsc --noEmit && bun test src`
Expected: no type errors; all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/suggestion.ts mobile/src/lib/suggestion.test.ts mobile/src/components/ClassifierLine.tsx mobile/src/components/ItemForm.tsx
git commit -m "feat(mobile): always pre-fill the classifier's best guess and say when it is unsure"
```

### Task 7: Int8 export and a photo scorer (Mac, while the PC trains; first to drop if late)

**Files:**
- Modify: `ml/stylify_ml/export.py`
- Create: `ml/stylify_ml/score.py`
- Test: `ml/tests/test_export.py`, `ml/tests/test_score.py`

**Interfaces:**
- Consumes: Task 3's `metrics.json` keys and `carousell_half`/`users_half`.
- Produces:
  - `export_pte(model, out_path, quantize: bool = False, calibration: torch.Tensor | None = None) -> int`: with `quantize`, PT2E quantisation with ExecuTorch's `XNNPACKQuantizer` and `get_symmetric_quantization_config(is_per_channel=True)`, calibrated on `calibration` (required when quantising), then lowered as today. Input `[1, 3, 224, 224]` float32, output 9 float32 logits.
  - `check_top1_agreement(pte_path, model, inputs, min_agreement: float) -> float`: share of inputs where the `.pte` and PyTorch top-1 agree; raises `ParityError` below `min_agreement`.
  - `score_pte(pte_path: Path, data: Path, half: str) -> dict`: `summarise` of the `.pte` on the test rows of one half (`"users"` or `"carousell"`), run through the ExecuTorch runtime one image at a time with C-contiguous tensors.
  - CLI: `export --run <dir> --out <dir> --int8 [--calibration-size 256]`. With `--int8`: export float to a temp dir and int8 to another; score both on `users` and `carousell`; write int8 to `--out` only if each int8 top-1 is within 0.01 of float's, else print the numbers and exit non-zero without touching `--out`. Calibration: the first `--calibration-size` train rows after a seeded shuffle (seed 0), one row per label round-robin. Parity for int8: `check_top1_agreement(..., min_agreement=0.9)` on 64 val crops.
  - `classifier.json` gains `"quantized": "int8"` or `"quantized": null`; scores gain `carousellTop1`/`carousellTop3` (from Task 3).
  - `python -m stylify_ml.score --pte <path> <photos...>`: the handoff's scorer as a module: prints each photo name and its top 3 labels with probabilities, using `load_image` and `eval_transform`.

- [ ] **Step 1: Write the failing tests** (skip the module if ExecuTorch is missing):
  - `test_int8_export_runs_and_agrees`: an untrained `mobilenet_v3_large` with a fixed seed, calibrated on 8 random tensors, exports with `quantize=True`; the `.pte` exists and `check_top1_agreement` on those 8 inputs is ≥ 0.75.
  - `test_quantize_without_calibration_is_an_error`: `ValueError`.
  - `test_metadata_records_quantized`: `write_metadata(..., quantized="int8")` writes `"quantized": "int8"`.
  - `test_score_prints_top3` (in `test_score.py`): on the placeholder `.pte` and two generated JPEGs, output has two lines each with three `label prob` pairs.

- [ ] **Step 2: Run them to see them fail**

Run: `cd ml && uv run pytest tests/test_export.py tests/test_score.py -v`
Expected: the new tests FAIL.

- [ ] **Step 3: Implement.** Check the exact quantizer import path in the installed ExecuTorch 1.5.1 (`executorch.backends.xnnpack.quantizer.xnnpack_quantizer`) and the PT2E functions (`torchao.quantization.pt2e.quantize_pt2e.prepare_pt2e`/`convert_pt2e` or `torch.ao.quantization.quantize_pt2e`, whichever the installed versions provide); capture with `torch.export.export(model, example).module()` before `prepare_pt2e`.

- [ ] **Step 4: Run the whole suite**

Run: `cd ml && uv run pytest -q`
Expected: all PASS.

- [ ] **Step 5: Try it on the shipped run** (it must not touch `mobile/assets/model/`)

Run: `cd ml && uv run python -m stylify_ml.export --run ~/stylify-data/runs/20261022-180946-efficientnet_b0 --out /private/tmp/claude-501/-Users-ml3787-Stylify/802b4d97-b079-4dcd-9451-da9223061a6d/scratchpad/int8-check --int8`
Expected: prints float and int8 top-1 on users and carousell and the `.pte` sizes (int8 roughly a quarter of 16 MB), and either writes or refuses. Either outcome is fine; record the numbers in the commit message.

- [ ] **Step 6: Commit**

```bash
git add ml/stylify_ml/export.py ml/stylify_ml/score.py ml/tests/
git commit -m "feat(ml): int8 export with an accuracy check, and a photo scorer"
```

### Task 8: Choose, export, document and ship (from 21:30)

**Files:**
- Modify: `mobile/assets/model/classifier.pte`, `mobile/assets/model/classifier.json`
- Modify: `docs/ml.md`

- [ ] **Step 1: Collect runs.** The PC has sent its runs (`pc_send_runs.sh`); Kaggle runs, if any, are moved into `~/stylify-data/runs/`. Evaluate any run lacking `metrics.json` on the Mac.
- [ ] **Step 2: Compare**

Run: `cd ml && uv run python -m stylify_ml.evaluate --data ~/stylify-data --compare --baseline 20261022-180946-efficientnet_b0`
Expected: a table and a `winner:` line.

- [ ] **Step 3: Check the winner on the photos**

Run: `cd ml && uv run python -I -m stylify_ml.score --pte <winner float .pte> ~/Downloads/IMG_9018.HEIC ~/Downloads/IMG_9019.HEIC ~/Downloads/IMG_9020.HEIC ~/Downloads/IMG_9021.HEIC` (export the winner to a scratchpad folder first), and look at its personal-set scores in the table.
Expected: IMG_9019 is still trousers; no clear regression on personal. If there is one, look before going on and tell Minh.

- [ ] **Step 4: Export.** If Task 7 is done: `export --run <winner> --out ../mobile/assets/model --int8`, then run `score` on the four photos with the int8 `.pte` and re-export float if its top-1 differs from float's on more than one of them; if it refuses or Task 7 was dropped: `export --run <winner> --out ../mobile/assets/model`. If the winner is the baseline, skip this step (only the app change ships).
- [ ] **Step 5: Mobile checks**

Run: `cd mobile && bunx tsc --noEmit && bun test src`
Expected: PASS (the config parser accepts the new `classifier.json`).

- [ ] **Step 6: Update `docs/ml.md`**: Labels/Data (Carousell row in the sources table, mapping, overrides file, `append_carousell` after any `prepare`), Commands (`append_carousell`, `--source-weight`, `--augment`, `--compare --baseline`, `export --int8`, `score`), a "Training on the gaming PC" section (WSL, `pc_setup.sh`, queue, `pc_send_runs.sh`), Retrain-and-ship step 3 (the new winner rule), and "Current model" with the comparison table of today's runs.
- [ ] **Step 7: Commit**

```bash
git add mobile/assets/model docs/ml.md
git commit -m "feat(ml): ship <run-id> trained with Carousell photos"
```

- [ ] **Step 8: Build to the iPhone**

Run: `cd mobile && bunx expo run:ios --configuration Release --device 00008110-0014453E0EDB801E`
Expected: build succeeds and the app opens on the phone. Then Minh checks: "Choose photo" with IMG_9019 says Trousers; a fresh "Take photo" of trousers and of a top; an unsure photo shows "My best guess is …".

- [ ] **Step 9: Push the branch** and ask Minh whether to fast-forward `main`.
