# Handoff: start the clothing classifier and snap-to-add spec

Date: 2026-10-13
Next step: brainstorm and write the spec for roadmap item 1, "Clothing classifier and snap-to-add". Nothing for it exists yet: no spec, no plan, no code, no dataset.

Earlier handoffs (`2026-10-05`, `2026-10-08`) are superseded. `AGENTS.md` and `docs/` describe the code as it is.

## Where things stand

| Area | State |
|---|---|
| Web app, API | Live at https://stylify.space. |
| iPhone app (`mobile/`) | Mobile foundation spec implemented and merged. Sign-in, wardrobe grid, add with camera or library, edit, delete, profile. Installed on Minh's iPhone from Xcode. |
| TestFlight / App Store | Dropped for now (Minh, 2026-10-08). No Apple Developer Program enrolment, no EAS. |
| App icon and splash | Minh's hanger artwork (2026-10-13). |
| CloudFront | API 404s reach clients as 404 since 2026-10-13 (function `stylify-spa-rewrite`; no custom error responses). |
| Web edit page | Shows "This item no longer exists" for a deleted item (2026-10-13). |

All of it is on `main`. There are no open branches and no unfinished plans.

## What the feature is (from the roadmap)

`docs/superpowers/specs/2026-10-05-mobile-foundation-design.md`, section "Future work", is the source. In short:

- Train a small image classifier in PyTorch (fine-tune a pretrained network such as MobileNetV3 or EfficientNet) on real clothing photos.
- Export it with ExecuTorch and run it on the phone through `react-native-executorch`. Fallback: `onnxruntime-react-native`.
- In the app: take a photo, the model pre-fills the item's type, the user confirms or corrects it. The model never adds an item silently.
- Minh's goals: learn PyTorch and on-device ML, and have this as the main feature of a portfolio app. Minh trains the model; it is not a hosted API call.

Open questions the roadmap already lists: where the training code lives (`ml/` here or a separate repo), how the model file ships (bundled or downloaded), and whether corrections are logged for retraining.

## Facts the spec must start from

- **`type` is free text today.** `shared/src/index.ts` validates it as a non-empty string and `server/db/schema/items.ts` stores `varchar(256)`. There is no fixed list of types, so the label set is a design decision, and existing items hold whatever users typed. Look at the real values before choosing labels (the app uses the production database; read-only queries only).
- **The add flow the classifier plugs into:** `mobile/src/lib/photo.ts` (camera or library, permissions) → `mobile/src/components/ItemForm.tsx` (fields, including type) → `mobile/src/lib/upload.ts` (JPEG re-encode to max width 1600, then S3) → `mobile/src/lib/api.ts`. `mobile/src/app/(tabs)/add.tsx` and `mobile/src/app/item/[id].tsx` are the two screens that use the form.
- **Expo SDK 55, React 19.2.0, New Architecture on.** The Mac is on macOS Sequoia with Xcode 26.3, which cannot compile SDK 56 or later. Any native library must support SDK 55. The roadmap recorded on 2026-10-06 that `react-native-executorch` 0.10.4 supports SDK 55 and later; check the current version and its requirements again, including iOS deployment target (the app's is 17.0) and whether it builds on Xcode 26.3.
- **To verify first, before designing around it:** how `react-native-executorch` loads a custom-trained model, what input it expects, and what a classification call returns. A throwaway spike on the simulator or the phone is the cheapest way to answer this.
- **A native dependency means a rebuild.** Add it with `bunx expo install`, then `bunx expo prebuild -p ios --clean` and reinstall (`docs/mobile.md`, "On an iPhone"). The app has no `expo-dev-client`.
- **The phone:** iPhone 13 Pro, iOS 27.0.1, free provisioning. Builds expire 7 days after install (last install 2026-10-13). The phone needs the Mac's dev server on the same Wi-Fi with Local Network allowed.
- **Training hardware:** MacBook Pro, M1 Pro. PyTorch can use the Apple GPU (MPS). No Python project exists in the repo yet.
- **Model size matters** if it is bundled: it ships inside the app binary. There is no CI for mobile.
- **The web app has no classifier plan.** It keeps the typed field.

## How to start the session

1. Use the brainstorming skill. This is architectural: questions one at a time, two or three approaches, a design approved section by section, then a written spec in `docs/superpowers/specs/`, then a plan.
2. Likely first questions for Minh: what the type labels should be (and what happens to free-text types already stored), which dataset to train on, and whether the first version is "pre-fill the type" only or more (colour, multiple suggestions with confidence).
3. Consider splitting into two specs or two plans, since the roadmap notes the training work is independent Python: (a) train and export a model, (b) run it in the app. The app side can be built against any exported model, including an untrained one.

## Working rules that are easy to forget

- Ask Minh before every push to `main`. Changes under `server/`, `shared/`, `frontend/`, the root `package.json` or the deploy workflows deploy the live site; `mobile/`, `infra/` and `docs/` do not.
- The AWS CLI session (`aws login`) expires; Minh re-authenticates with `! aws login`.
- Never print or commit `.env` values. The app and local development use the production database and bucket; delete test items.
- Tests: `bun test ./server`, `bun test ./infra`, `bun test ./frontend`, and in `mobile/`: `bunx tsc --noEmit && bun test src`.

## Small things left open (none blocks the classifier)

- The Android icon images are still Expo placeholders (the app is iPhone-only).
- `mobile/src/lib/unmaskNotFound.ts` is now a no-op guard; removing it is optional.
- `~/stylify-cloudfront-backup-2026-10-13/` holds the pre-change CloudFront config; delete it once the fix has been live for a while.
- Later roadmap items: web landing page and read-only demo; outfit suggestions, wear tracking and search in the mobile app.
