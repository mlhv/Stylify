# Handoff: retrain the classifier for "in your room" photos

Date: 2026-10-24. Written for a fresh session. Read `AGENTS.md` and `docs/ml.md` first.

## Where things stand

- `main` is at 26e95bf, pushed and deployed. It contains the frontend polish (plan `docs/superpowers/plans/2026-10-23-frontend-polish.md`, all 12 tasks done) and a web fix that converts HEIC photos to JPEG in the browser (`frontend/src/lib/photo.ts`, heic-to 1.6.5, loaded only when a HEIC is picked).
- Live smoke test passed (`https://stylify.space` 200, `/api/me` 401). Minh added a photo on the web and it worked.
- The iPhone has a Release build from 2026-10-24 (`bunx expo run:ios --configuration Release --device 00008110-0014453E0EDB801E` from `mobile/`). Free provisioning expires after 7 days, around 2026-10-31.
- The shipped classifier is unchanged since 2026-10-22: `efficientnet_b0`, run `20261022-180946-efficientnet_b0`, threshold 0.7084821462631226, in `mobile/assets/model/`. See `docs/ml.md` "Current model".

## The problem

Minh tried the classifier on the phone with fresh "Take photo" shots. Plain t-shirts worked most of the time. Trousers never did, and other pieces always got "Not sure about this one. Which is it?", never a confident wrong guess. Minh's diagnosis, which the evidence supports: the model needs training photos taken the way people actually photograph their clothes: **on a bed or the floor, in a room, with a hand holding the item or a hanger, even feet in frame, with clutter around.**

Four of Minh's photos (taken with the Camera app, then exported) are in `~/Downloads/IMG_9018.HEIC` to `IMG_9021.HEIC`. They are personal photos: never put them in the repo. Ask Minh before moving or copying them into `~/stylify-data/personal/` (that folder is the "personal" evaluation set and is never trained on).

Scores from the shipped `.pte`, preprocessed exactly like training (`eval_transform`):

| Photo | What it is | Top guesses | Result at 0.708 |
|---|---|---|---|
| IMG_9018 | navy baseball cap held in a hand, room behind | dress 0.25, skirt 0.17, hat 0.13 | Not sure |
| IMG_9019 | black wide jeans flat on a wooden floor, foot at the edge | trousers 0.85 | Trousers (correct) |
| IMG_9020 | blue Snoopy pyjama bottoms flat on a bed | trousers 0.49, shorts 0.43 | Not sure |
| IMG_9021 | beige sheer knit top on a hanger on a bed, laptop in frame | skirt 0.48, top 0.41 | Not sure |

The three unsure photos are unstable: re-saving as JPEG 0.9 or resizing differently moves the cap between dress, hat and trousers, the Snoopy bottoms between trousers and shorts, and the knit top between skirt and top. They sit on the decision boundary.

The current personal set (`~/stylify-data/personal/`, 16 photos, no bag, dress or skirt photos, one trousers photo) scores 13/16 top-1 with the same script, matching `classifier.json` (`personalTop1` 0.8125).

## The app is not the cause (verified 2026-10-24)

The four photos were added to the iPhone 17 simulator's Photos (`xcrun simctl addmedia booted …`) and picked with "Choose photo" in a debug build with temporary logging (since removed; the tree is clean). The image the app feeds the model (`expo-image-manipulator` stretch to 224×224, JPEG 0.9, `jpeg-js` decode) is upright and matches training. The app's scores agree with the Mac's: jeans trousers 0.86 ("Ooh, that looks like Trousers!"), knit top 0.61 / skirt 0.30, Snoopy shorts 0.46 / trousers 0.44, cap all nine between 0.10 and 0.18. The jeans failures on the phone came from fresh in-app camera shots, which are not saved, so they could not be compared.

Optional cheap check, not yet done: on the phone, "Choose photo" with the saved IMG_9019; it should say Trousers. If it says "Not sure", the device build differs from the simulator and needs a look.

## How to score a photo on the Mac

Run from `ml/` with `uv run python -I <script> <photos…>`. It uses the training code's own loader (reads HEIC, applies EXIF rotation) and transform. Note that a hand-rolled numpy pipeline must pass a C-contiguous tensor to the ExecuTorch runtime; a transposed view gives garbage (everything scored "shoes").

```python
import json, sys
from pathlib import Path
import torch
from executorch.runtime import Runtime
from stylify_ml.data import load_image, eval_transform
root = '/Users/ml3787/Stylify/mobile/assets/model/'
cfg = json.load(open(root + 'classifier.json'))
m = Runtime.get().load_program(root + 'classifier.pte').load_method('forward')
tf = eval_transform()
for path in sys.argv[1:]:
    p = torch.softmax(m.execute([tf(load_image(Path(path)))[None]])[0][0], 0)
    top = sorted(zip(cfg['labels'], p.tolist()), key=lambda t: -t[1])[:3]
    print(Path(path).name, '  '.join(f'{l} {v:.2f}' for l, v in top))
```

## Next step: brainstorm, then spec, then plan

The retrain is a project: run superpowers:brainstorming with Minh, write a spec in `docs/superpowers/specs/`, then superpowers:writing-plans. The brainstorm had just started. The first question asked, not yet answered:

> How many of your own clothes are you willing to photograph yourself, and how much do you want to rely on public datasets that already have messy real-life shots?

Things the brainstorm needs to settle (open, nothing decided yet):

- **Where the new photos come from:** Minh's own photos (realistic but few, and a labelled evaluation set must stay separate from anything trained on), public datasets with cluttered real-life shots (licences matter: see the table in `docs/ml.md` "Data"), synthetic compositing of existing crops onto bed/floor/room backgrounds with hands, or a mix.
- **How success is measured:** today's metrics are val balanced accuracy, "users" top-1/top-3 (the clothing dataset's held-out photographers) and the personal set. None of them looks like Minh's room photos. A new "in-room" test set, never trained on, probably needs to come first so before/after numbers mean something.
- **Threshold:** recalibrated on usersVal to 0.708 on 2026-10-22. A retrain needs it recalibrated again, ideally on in-room photos.
- **Constraints that still hold:** `.pte` ≤ 20 MB; Expo SDK 55 / `react-native-executorch` as shipped; no app code change should be needed if labels, input size and normalisation stay the same; training runs on Kaggle (account `hongminhlv`, `docs/ml.md` "Training on Kaggle"; the Kaggle CLI login expires after a few hours: `uvx kaggle auth login --force`) or on the Mac on AC power with the lid open.
- **Folded-in ideas** from earlier notes: a hyperparameter sweep on Kaggle, int8 quantisation, speeding up the Kaggle kernel (copy inputs to local disk, score a fixed val sample per epoch).

## Other open items (not part of the retrain)

- iPhone checks only Minh can do with taps: sign-in screen after a real sign-out; filter pill, then delete a piece while its filter is selected (closet should return to All); pull to refresh; tap the very top of the raised + button; keyboard on the Colour field.
- `mobile/app.json` sets `userInterfaceStyle: "light"` and a cream splash, which only reach the native app after `expo prebuild` (then re-select the signing team in Xcode and trust the developer on the phone again).
- The "Miffy top" item shows a plain blue tile on the iPhone. Not yet checked whether its photo reached S3 correctly (it may be the item Minh added on the web from a HEIC photo).
- The web shows the landing page instead of an error when the API is unreachable (pre-existing auth-guard behaviour); the guard could tell a 401 from a network or 5xx error.
- After `aws login`, a running `bun run dev` API keeps the expired session and must be restarted.

## Environment as left

- Dev servers running: API on :8080, Vite on :5173, Metro on :8081 (started in CI mode). Stop them if not needed.
- The iPhone 17 simulator is booted, signed in, with the four photos in Photos.
