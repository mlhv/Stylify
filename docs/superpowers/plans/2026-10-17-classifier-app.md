# Clothing Classifier, Plan B: Snap-to-Add in the App

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a photo is chosen in the iPhone app's item form, an on-device ExecuTorch model suggests the type: it pre-fills the field when confident and always offers its top 3 as chips.

**Architecture:** `classifierConfig.ts` (pure) reads `classifier.json` and owns labels, display names and normalisation; `suggestion.ts` (pure) decides pre-fill and chips; `classify.ts` (native) turns a photo URI into predictions with `react-native-executorch`; `useTypeSuggestion.ts` runs it for `ItemForm` and drops stale results. Built first against Plan A's placeholder model, then the real one.

**Tech Stack:** Expo SDK 55, React Native 0.83.10, `react-native-executorch` 0.10.5, `expo-image-manipulator`, `jpeg-js`, `expo-asset`, TanStack Form 0.32, NativeWind, `bun test`.

**Spec:** `docs/superpowers/specs/2026-10-17-clothing-classifier-design.md` (sections "Spike results", "Part 2", "Verification on the phone").

## Global Constraints

- Exact versions, no ranges: `react-native-executorch` 0.10.5, `react-native-worklets` 0.10.4, `react-native-reanimated` 4.5.5, `react-native-blob-util` 0.24.12, `jpeg-js` 0.4.4. Do not add `@kesha-antonov/react-native-background-downloader`. Never run `expo install --fix` on worklets or Reanimated.
- The root `package.json` is not changed (it deploys). After any `mobile/package.json` change, run `bun install` at the root and commit `bun.lockb`.
- Labels in model output order `top, outerwear, trousers, shorts, skirt, dress, shoes, hat, bag`; shown and saved as `Top, Outerwear, Trousers, Shorts, Skirt, Dress, Shoes, Hat, Bag`.
- Pre-fill only when top-1 confidence ≥ `threshold` from `classifier.json` **and** the type field is empty or still equals the last pre-fill. Never overwrite a type the user typed or picked.
- Chips: the top 3 display names, in order.
- Any classifier failure: `console.warn`, nothing shown, the form works as before. No alerts.
- Photo preprocessing in the app: resize to 224×224 (stretched), `resizeMode: 'stretch'`, normalisation `alpha = 1 / (255 · std)`, `beta = −mean / std`, per channel.
- `mobile/ios` is generated: after native changes, `bunx expo prebuild -p ios --clean`, then reset signing (`docs/mobile.md`, "On an iPhone").
- Nothing under `mobile/` deploys. Ask before pushing to `main` anyway.

## Review Focus

1. **The user types in the type field while classification is running.** Expected: the result does not overwrite it; chips still appear. `decide` must read the field's value when the result arrives, not when the photo was picked. Test in Task 3 (`test uses the field value at completion`).
2. **A second photo chosen before the first result arrives.** Expected: only the second photo's result is applied. Test in Task 3 (`test drops a result for an earlier photo`).
3. **The model asset fails to load, or the photo can't be decoded.** Expected: no chips, no "Identifying…" stuck on screen, the form saves normally. Test in Task 3 (`test clears the pending state on failure`).
4. **Edit screen with a saved type, then a new photo.** Expected: chips appear, the saved type stays (its value is not the last pre-fill). Test in Task 2 (`keeps a saved type`).
5. **The user accepts a pre-fill, then picks a new photo that suggests a different label.** Expected: the field updates to the new suggestion, because it still holds the last pre-fill. Test in Task 2 (`replaces its own earlier pre-fill`).

## File Structure

```
mobile/
  package.json                       dependencies, "react-native-executorch" block, postinstall
  scripts/executorch-libs.cjs        runs the library's native download with INIT_CWD = mobile/
  metro.config.js                    adds the pte asset extension
  assets/model/classifier.pte, .json from Plan A (placeholder first)
  src/lib/classifierConfig.ts        labels, display names, config parsing, normalisation (pure)
  src/lib/classifierConfig.test.ts
  src/lib/suggestion.ts              decide() (pure)
  src/lib/suggestion.test.ts
  src/lib/classify.ts                classifyPhoto() (native)
  src/lib/typeSuggestion.ts          the stale-result and pending-state logic (pure)
  src/lib/typeSuggestion.test.ts
  src/lib/useTypeSuggestion.ts       React hook over typeSuggestion + classifyPhoto
  src/components/ItemForm.tsx        "Identifying…", chips, pre-fill
```

---

### Task 1: Native dependencies and the placeholder model

**Prerequisite:** Plan A Task 2 has produced `mobile/assets/model/classifier.pte` and `classifier.json` (the placeholder, `threshold` 1.0).

**Files:**
- Modify: `mobile/package.json`, `mobile/metro.config.js`, `bun.lockb`, `AGENTS.md`, `docs/mobile.md`
- Create: `mobile/scripts/executorch-libs.cjs`

- [ ] **Step 1: Add the dependencies** from `mobile/`: `bun add --exact react-native-executorch@0.10.5 react-native-worklets@0.10.4 react-native-reanimated@4.5.5 react-native-blob-util@0.24.12 jpeg-js@0.4.4`.
- [ ] **Step 2: Native download.** In `mobile/package.json` add `"react-native-executorch": { "features": ["classification"] }` and `"postinstall": "node scripts/executorch-libs.cjs"`. The script resolves `react-native-executorch/package.json` with `require.resolve`, then runs its `scripts/download-libs.js` with `node` and `INIT_CWD` set to the `mobile/` directory, inheriting stdio and exiting with its status.
- [ ] **Step 3: Verify the install paths.** Run `bun install` at the root. Expected: the postinstall runs and `node_modules/react-native-executorch/third-party/ios/` contains `ExecutorchLib.xcframework` and `XnnpackBackend.xcframework`; a second `bun install` finishes without downloading again. Then confirm the deploys are unaffected: `docker build -f server/Dockerfile -t stylify-check .` succeeds and `docker run --rm stylify-check sh -c 'ls node_modules | wc -l'` prints about 57; `bun install --frozen-lockfile --filter frontend --omit=peer` in a clean clone does not run the mobile postinstall. If Bun does not run the workspace postinstall, keep the script as `bun run executorch:libs` and document it as a manual step instead.
- [ ] **Step 4: Metro.** In `metro.config.js`, `config.resolver.assetExts.push('pte')` before `withNativeWind`.
- [ ] **Step 5: Check the JS side.** `cd mobile && bunx tsc --noEmit && bun test src`. Expected: clean, 54 tests pass.
- [ ] **Step 6: Rebuild and smoke-test.** `bunx expo prebuild -p ios --clean`, then `bunx expo run:ios --device "iPhone 17"`. Expected: the app starts; sign in, the wardrobe grid, tab switches and navigation to an item work (Reanimated changed).
- [ ] **Step 7: Docs.** `AGENTS.md`, under rules: "`react-native-worklets` 0.10.4 and `react-native-reanimated` 4.5.5 are deliberately newer than Expo SDK 55's expected versions (`react-native-executorch` needs them); do not run `expo install --fix` on them." `docs/mobile.md`: the postinstall downloads ExecuTorch binaries (about 175 MB in `node_modules`), and the model lives in `mobile/assets/model/`.
- [ ] **Step 8: Commit**

```bash
git add mobile/package.json mobile/scripts/ mobile/metro.config.js bun.lockb AGENTS.md docs/mobile.md
git commit -m "feat(mobile): add react-native-executorch and its native libraries"
```

### Task 2: Labels, config and the suggestion rules

**Files:**
- Create: `mobile/src/lib/classifierConfig.ts`, `mobile/src/lib/classifierConfig.test.ts`, `mobile/src/lib/suggestion.ts`, `mobile/src/lib/suggestion.test.ts`

**Interfaces:**
- Produces:
  - `LABELS = ['top', 'outerwear', 'trousers', 'shorts', 'skirt', 'dress', 'shoes', 'hat', 'bag'] as const`; `type Label = (typeof LABELS)[number]`
  - `DISPLAY_NAMES: Record<Label, string>` (`Top`, `Outerwear`, ... `Bag`)
  - `type ClassifierConfig = { labels: Label[]; threshold: number; inputSize: number; resizeMode: 'stretch'; normalizeOpts: { alpha: number[]; beta: number[] } }`
  - `parseConfig(json: unknown): ClassifierConfig` (throws if `labels` is not exactly `LABELS` in order, `resizeMode` is not `'stretch'`, or `threshold` is outside [0, 1])
  - `type Prediction = { label: Label; confidence: number }`
  - `type Decision = { prefill: string | null; chips: string[] }`
  - `decide(predictions: Prediction[], threshold: number, currentType: string, lastPrefill: string | null): Decision`

- [ ] **Step 1: Write the failing tests.** `classifierConfig.test.ts`:

```ts
test('the shipped classifier.json matches the app labels', () => {
  const config = parseConfig(require('../../assets/model/classifier.json'))
  expect(config.labels).toEqual([...LABELS])
})
test('rejects labels in another order', () => {
  expect(() => parseConfig({ ...valid, labels: ['outerwear', 'top', ...LABELS.slice(2)] })).toThrow()
})
test('converts mean and std to alpha and beta', () => {
  const c = parseConfig({ ...valid, normalize: { mean: [0.5, 0.5, 0.5], std: [0.25, 0.5, 1] } })
  expect(c.normalizeOpts.alpha).toEqual([1 / 63.75, 1 / 127.5, 1 / 255])
  expect(c.normalizeOpts.beta).toEqual([-2, -1, -0.5])
})
```

`suggestion.test.ts` (with `p = [{ label: 'shoes', confidence: 0.9 }, { label: 'bag', confidence: 0.06 }, { label: 'hat', confidence: 0.03 }]`):

```ts
test('pre-fills an empty field above the threshold', () => {
  expect(decide(p, 0.8, '', null)).toEqual({ prefill: 'Shoes', chips: ['Shoes', 'Bag', 'Hat'] })
})
test('no pre-fill below the threshold, chips still shown', () => {
  expect(decide(p, 0.95, '', null)).toEqual({ prefill: null, chips: ['Shoes', 'Bag', 'Hat'] })
})
test('pre-fills at exactly the threshold', () => { expect(decide(p, 0.9, '', null).prefill).toBe('Shoes') })
test('keeps a saved type', () => { expect(decide(p, 0.8, 'Sneakers', null).prefill).toBeNull() })
test('keeps a type the user changed after a pre-fill', () => { expect(decide(p, 0.8, 'Boots', 'Hat').prefill).toBeNull() })
test('replaces its own earlier pre-fill', () => { expect(decide(p, 0.8, 'Hat', 'Hat').prefill).toBe('Shoes') })
test('a whitespace-only field counts as empty', () => { expect(decide(p, 0.8, '  ', null).prefill).toBe('Shoes') })
test('fewer than three predictions', () => { expect(decide(p.slice(0, 1), 0.8, '', null).chips).toEqual(['Shoes']) })
test('the placeholder threshold of 1 never pre-fills', () => { expect(decide(p, 1, '', null).prefill).toBeNull() })
```

- [ ] **Step 2: Run** `cd mobile && bun test src/lib/classifierConfig.test.ts src/lib/suggestion.test.ts`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** both modules. `decide` sorts nothing (predictions arrive sorted) and takes the first 3.
- [ ] **Step 4: Run** `bunx tsc --noEmit && bun test src`. Expected: all pass.
- [ ] **Step 5: Commit** `git add mobile/src/lib && git commit -m "feat(mobile): classifier labels, config parsing and suggestion rules"`

### Task 3: Classifying a photo and the form integration

**Files:**
- Create: `mobile/src/lib/classify.ts`, `mobile/src/lib/typeSuggestion.ts`, `mobile/src/lib/typeSuggestion.test.ts`, `mobile/src/lib/useTypeSuggestion.ts`
- Modify: `mobile/src/components/ItemForm.tsx`

**Interfaces:**
- Consumes: `parseConfig`, `ClassifierConfig`, `Prediction`, `decide`, `DISPLAY_NAMES`.
- Produces:
  - `classifyPhoto(uri: string): Promise<{ predictions: Prediction[]; threshold: number }>` in `classify.ts`. Loads `assets/model/classifier.pte` with `Asset.loadAsync`, strips `file://`, and creates the classifier once (a module-level promise; on failure the promise is cleared so the next photo retries) with `createClassifier({ modelPath, modelOpts: { labels: config.labels, resizeMode: 'stretch', interpolation: 'linear', normalizeOpts: config.normalizeOpts } })`. Then `ImageManipulator.manipulate(uri).resize({ width: 224, height: 224 })`, render, save as JPEG with `base64: true`, decode with `jpeg-js` (`useTArray: true`), and `classify({ data, width, height, format: 'rgba', layout: 'hwc' }, { topk: 3 })`. Logs `[classify] <ms>` total with `console.log`.
  - `type ClassifyResult = { predictions: Prediction[]; threshold: number }` (exported from `typeSuggestion.ts`, returned by `classifyPhoto`).
  - `typeSuggestion.ts` (pure): `createTypeSuggestion(run: (uri: string) => Promise<ClassifyResult>, handlers: { onPending(pending: boolean): void; onResult(result: ClassifyResult): void }): { start(uri: string): void }`. `start` calls `onPending(true)`. When the run for the **latest** started `uri` resolves: `onPending(false)`, then `onResult(result)`. When it rejects: `onPending(false)` and `console.warn`. Results and errors for earlier `uri`s are ignored entirely.
  - `useTypeSuggestion(onResult: (result: ClassifyResult) => void): { pending: boolean; start(uri: string): void }` in `useTypeSuggestion.ts`: holds `pending` in state, creates one `createTypeSuggestion(classifyPhoto, ...)` per mount, and always calls the latest `onResult` (kept in a ref). `ItemForm` keeps the chips in its own state and reads the field inside `onResult`, so `decide` sees the value at completion.

- [ ] **Step 1: Write the failing tests** in `typeSuggestion.test.ts` (with a controllable `run` built from deferred promises):

```ts
test('drops a result for an earlier photo', async () => {
  // start('a'), start('b'), resolve a, resolve b
  expect(onResult).toHaveBeenCalledTimes(1)
  expect(onResult).toHaveBeenCalledWith(resultB)
})
test('clears the pending state on failure', async () => {
  // start('a'), reject a
  expect(pendingCalls).toEqual([true, false])
  expect(onResult).not.toHaveBeenCalled()
})
test('a failure for an earlier photo does not clear the pending state of the latest', async () => {
  // start('a'), start('b'), reject a
  expect(pendingCalls.at(-1)).toBe(true)
})
test('uses the field value at completion', async () => {
  // a field variable is '' at start('a'); set it to 'Boots' before resolving;
  // onResult runs decide(result.predictions, result.threshold, field, null)
  expect(decisionFromOnResult.prefill).toBeNull()
})
```

- [ ] **Step 2: Run** `bun test src/lib/typeSuggestion.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `typeSuggestion.ts`, then `classify.ts` and `useTypeSuggestion.ts` to the interfaces above.
- [ ] **Step 4: Run** `bunx tsc --noEmit && bun test src`. Expected: all pass.
- [ ] **Step 5: Wire up `ItemForm`.**
  - In `choose()`, after `setPhotoUri(uri)`, call `start(uri)`.
  - Keep `lastPrefill` in a ref. When a result arrives: `const d = decide(result.predictions, result.threshold, form.getFieldValue('type'), lastPrefill.current)`; if `d.prefill`, then `form.setFieldValue('type', d.prefill)` and set `lastPrefill.current = d.prefill`; store `d.chips`.
  - Under the type field only: "Identifying…" (`text-sm text-neutral-500`) while `pending`; otherwise a row of chips (`rounded-full bg-neutral-200 px-3 py-1`, `accessibilityRole="button"`, `accessibilityLabel` "Set type to X"). Tapping a chip calls `form.setFieldValue('type', name)`. Chips that equal the current value use `bg-neutral-900` with white text.
  - The existing `FIELDS.map` keeps rendering all four fields; render the extra row when `name === 'type'`.
- [ ] **Step 6: Simulator check with the placeholder model.** `bunx expo run:ios --device "iPhone 17"`. On Add, pick a library photo: "Identifying…" shows briefly, then three chips (equal confidences, any order); the type field stays empty (threshold 1.0). Tap a chip: the field fills. Type something, pick another photo: the field keeps the typed value. On an existing item's edit screen, change the photo: chips appear, the saved type stays. Temporarily rename `classifier.pte` in the bundle (or throw in `classifyPhoto`) to confirm failure leaves no spinner and the item saves; revert.
- [ ] **Step 7: Commit** `git add mobile/src && git commit -m "feat(mobile): suggest the item type from the photo"`

### Task 4: The real model, on the phone

**Prerequisite:** Plan A Task 9 has exported the trained model into `mobile/assets/model/`.

- [ ] **Step 1: Run** `cd mobile && bunx tsc --noEmit && bun test src`. Expected: all pass, including the shipped-config test against the real `classifier.json`.
- [ ] **Step 2: Release build on the phone.** Note the current app size first (Settings → General → iPhone Storage → Stylify). Then `bunx expo prebuild -p ios --clean` (reset signing), and `bunx expo run:ios --configuration Release --device "<phone>"`.
- [ ] **Step 3: Measure.** With Console.app filtered on `[classify]` for the phone: photo-to-suggestion time for 5 photos. Note the app size again.
- [ ] **Step 4: If the median is over 300 ms,** replace the `jpeg-js` decode with a native one (spec suggests `@shopify/react-native-skia` `readPixels`; pick an SDK 55-compatible exact version), re-run Step 3, and record both numbers. Otherwise skip.
- [ ] **Step 5: Verify on the phone** with one fresh photo per label (not from `~/stylify-data/personal/`): pre-fill and chips follow the rules; a typed type is never overwritten; editing an item and changing its photo keeps its type. Then sign in, add, edit, delete and sign out still work, with a look at tab and navigation animations.
- [ ] **Step 6: Record results** in `docs/mobile.md` ("Known limits" or a new "Classifier" section): date, device, per-label outcome, median time, model load time, app size before and after.
- [ ] **Step 7: Commit** `git add docs/mobile.md mobile/ && git commit -m "docs(mobile): classifier verified on the phone"`
