# Handoff: put the trained classifier in the app (Plan B)

Date: 2026-10-22
Next step: recalibrate the classifier's confidence threshold on user photos (short, `ml/` only), then implement Plan B, `docs/superpowers/plans/2026-10-17-classifier-app.md`, with subagent-driven development.

Earlier handoffs are superseded. `AGENTS.md`, `docs/ml.md` and `docs/mobile.md` describe the code as it is.

## Where things stand

| Area | State |
|---|---|
| Web app, API | Live at https://stylify.space. Unchanged by the classifier work. |
| iPhone app (`mobile/`) | Mobile foundation merged. No classifier code yet. Installed from Xcode with free provisioning; builds expire 7 days after install. |
| Classifier spec | `docs/superpowers/specs/2026-10-17-clothing-classifier-design.md`. Part 1 (model) is done; Part 2 (app) is Plan B. |
| Plan A (model) | Done and on `main` (5cc50b4). `ml/` is a `uv` project; 89 tests (`cd ml && uv run pytest`). |
| Shipped model | `mobile/assets/model/classifier.pte` (16.1 MB) and `classifier.json`: `efficientnet_b0`, run `20261022-180946-efficientnet_b0`, threshold 0.534. |
| Plan B (app) | Written 2026-10-17, not started. |

There are no open branches.

## The shipped model

- Trained on Kaggle (free T4) on 120,258 crops from DeepFashion2, DeepFashion-MultiModal, web product photos (shoes, hats, bags) and half of the Grigorev clothing dataset (volunteers' own phone photos).
- The other half of the clothing dataset, split by photographer, is the "users" test: 2,478 photos. On it the model is right first time 89.3% of the time and within its top 3 98.7%. The morning's model (no clothing data) scored 73.0%.
- Weak spots on real photos: tops called `outerwear` (65 of 1,169), dresses called `top` (50 of 189; dress recall 66%). Shoes, hats and trousers are strong. Neither test set has bags.
- Details, the comparison table and every command: `docs/ml.md`.

## Step 1: recalibrate the threshold (before Plan B)

**Problem.** `evaluate.py` picks the threshold on the validation set, which is mostly DeepFashion2. There, 95% of pre-fills at 0.534 are right. On the users test, 0.534 pre-fills 93.7% of photos and only 91.9% of those are right. Two of Minh's 16 photos would be pre-filled wrongly: a grey zip hoodie (`trousers` 0.66) and a white blouse (`outerwear` 0.65). On the users test, 0.7 gives 94.1% correct on 85% of photos and 0.8 gives 95.8% on 76%.

**Proposed fix** (to confirm with Minh):
- Split the clothing dataset's photographers three ways instead of two: train / users-val / users-test, by stable hash of `sender_id` as today (`clothing_split` in `ml/stylify_ml/prepare.py`).
- Pick the threshold on users-val (the same 95% reweighted-precision rule, `pick_threshold` in `metrics.py`), and keep users-test untouched for reporting.
- This changes which photos are trained on, so it needs a `prepare` (DeepFashion2 must be unzipped: `docs/ml.md`), a Kaggle run of `efficientnet_b0` only, an evaluate, and a fresh export. Or, cheaper and worth asking about: keep the current training split and carve users-val out of the users test only, at the cost of a smaller test.
- Update the spec's threshold rule and `docs/ml.md`.

Plan B reads the threshold from `classifier.json`, so the app needs no change for this.

## Step 2: Plan B

Run `docs/superpowers/plans/2026-10-17-classifier-app.md` with superpowers:subagent-driven-development. Four tasks: native dependencies, label config and the pre-fill rules (`suggestion.ts`), classifying a photo in `ItemForm`, then the real model on the phone.

Things the plan was written before, which the session should account for:
- **The real model is already in `mobile/assets/model/`.** Task 1 says to build against the placeholder first. The real model works for that too; the placeholder (always below threshold, so chips only) can be re-exported with `uv run python -m stylify_ml.export --placeholder --out <dir>` if a task needs it. Do not commit a placeholder over the real model.
- **`classifier.json` now has two more scores,** `usersTop1` and `usersTop3`, beside `valBalancedAccuracy`, `personalTop1`, `personalTop3`. The app should ignore unknown keys.
- **The app must treat `threshold >= 1.0` as "never pre-fill"** (a ruling from Plan A: softmax can saturate to 1.0).
- **Re-check versions** before Task 1: `react-native-executorch` 0.10.5 and its peers were current on 2026-10-17. The Mac stays on Xcode 26.3 / Expo SDK 55; if a newer version needs more, say so and stop.
- The test count in Task 1 Step 5 ("54 tests") may be out of date; read the real count first.
- Task 4 measures photo-to-suggestion time on the phone in a release build; over 300 ms median means replacing the `jpeg-js` decode with a native one.

## Data and accounts (not in the repo)

- `~/stylify-data/`: `raw/` (MultiModal, web photos, clothing dataset), `crops/`, `manifest.csv`, `personal/<label>/` (Minh's 16 photos: no bags, dresses or skirts yet), `runs/`, `kaggle/` (the last upload bundle and output).
- DeepFashion2 zips stay in `~/Downloads` (`train.zip`, `validation.zip`). They are encrypted; `unzip` prompts for the password. Never write the password into a file.
- Kaggle: user `hongminhlv`. Private datasets `stylify-data` and `stylify-ml-code`, private kernel `stylify-train`. The CLI's OAuth login expires after a few hours; `uvx kaggle auth login --force` renews it. Kaggle shows a batch run's log only partway through or at the end, and the CLI's `kernels logs` returns nothing while it runs. About 4 of the week's 30 GPU hours were used on 2026-10-22.
- Disk is tight (about 26 GB free). Unzipped DeepFashion2 is 12.5 GB; delete `raw/deepfashion2/` after each `prepare`.

## Later (not part of this handoff)

Saved for résumé-style, measured improvements: a small hyperparameter sweep on Kaggle; int8 quantisation of the `.pte` (size, speed, accuracy cost); a faster Kaggle kernel (copy inputs to local disk, search inputs once, score a fixed validation sample each epoch; the T4 is only about 2× the Mac today because loading data is the bottleneck); per-source scores in `evaluate` to catch shortcuts. Minh also has an RTX 5070 PC that could replace Kaggle for training (WSL2 suggested).

## Working rules that are easy to forget

- Ask before pushing to `main`. Changes in `ml/`, `docs/` and `mobile/` do not deploy, but ask anyway.
- Datasets, crops, runs and personal photos never go in the repo; only `mobile/assets/model/` is committed.
- Training on the Mac must stay on power with the lid open (no resume; a sleep killed a run on 2026-10-19). Kaggle avoids this.
- After a native dependency change: `bunx expo prebuild -p ios --clean`, then reset signing (`docs/mobile.md`, "On an iPhone").
