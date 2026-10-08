Superseded on 2026-10-08: Tasks 8 and 10 are done, Task 9 (TestFlight) was dropped, and Xcode 26.3 does install to iOS 27. See `docs/mobile.md`.

# Handoff: Expo mobile app, after Tasks 1–7

Date: 2026-10-08
Plan: `docs/superpowers/plans/2026-10-06-expo-mobile-app.md`
Spec: `docs/superpowers/specs/2026-10-05-mobile-foundation-design.md`
Execution method: superpowers subagent-driven development. The ledger is at `.superpowers/sdd/2026-10-06-expo-mobile-app/progress.md` (git-ignored, on this Mac). Read it first; it holds every ruling, review result and deferred minor finding.

## Where things stand

| Task | State |
|---|---|
| 1. API answers 503 when a bearer token could not be checked | Live on `main` (`09d2ef1`) |
| 2. `mobile/` workspace, CI and Docker changes | Live on `main` (`7cbb3e9`), redone on Expo SDK 55 |
| 3. Kinde sign-in and token check | Done on `feat/mobile-app`; token check passed |
| 4. Typed API client, 401/503 rules, wardrobe grid | Done on `feat/mobile-app` |
| 5. Add an item with a photo | Done on `feat/mobile-app` |
| 6. Edit and delete | Done on `feat/mobile-app` |
| 7. Profile | Done on `feat/mobile-app` |
| 8. Device checklist on the iPhone | Not started; blocked (see below) |
| 9. TestFlight | Not started; needs Apple Developer Program enrolment |
| 10. `docs/mobile.md`, `AGENTS.md`, spec status, merge | Not started |
| Final whole-branch review | Not started |

`main` is at `7cbb3e9` and deployed. `feat/mobile-app` is 9 commits ahead (`1cc78ed` … `0a01dc0`), not pushed. It changes only `mobile/`, so merging it will not deploy.

Minh ran the simulator checklist for Tasks 4–7 on 2026-10-08 and everything passed after two fix rounds: add (library photo, real S3 upload), edit, delete, an item deleted on the web, the grid with an odd count, profile, sign out and back in. Mobile tests: 29 pass.

## Decisions made this session that differ from the plan

1. **Expo SDK 55, not 57.** Minh's Mac runs macOS Sequoia, where Xcode 26.3 (Swift 6.2.4) is the newest. SDK 56 and 57 fail to compile `expo-modules-jsi` on it (expo/expo #49941, #50067). SDK 55 builds. React is pinned to 19.2.0 (was 19.2.3) in `frontend/package.json`, root `overrides` and `mobile/`. The plan's task bodies still show SDK 57 snippets; a dated note at the top of the plan says to re-typecheck each one, and "the SDK wins".
2. **`@kinde/expo` stays at 0.9.0.** Its peer range names Expo 56/57, so Bun prints peer warnings. It works on SDK 55: audience present, `/api/me` 200, same user ID on web and mobile.
3. **iOS deployment target 17.0 is set with the `expo-build-properties` plugin**; `ios.deploymentTarget` is not an `app.json` key on SDK 55.
4. **S3 upload uses `fetch` from `expo/fetch` with a `File` body.** `File.upload` does not exist in SDK 55's `expo-file-system`.
5. **Token refresh:** the Kinde SDK never throws; a network failure comes back as a failed result. `mobile/src/lib/refreshOutcome.ts` maps a network failure to "unreachable" (stay signed in) and everything else to "session over". Known limit: Kinde answering 5xx during a refresh still signs the user out, because the SDK does not distinguish it from a rejected token.
6. **CloudFront masks API 404s.** The distribution's SPA fallback turns any origin 404 into `200 text/html`. `mobile/src/lib/unmaskNotFound.ts` turns a 2xx non-JSON API answer back into a 404. A deleted item then shows "This item no longer exists"; deleting an already-deleted item counts as done.
7. **The edit screen always refetches on open**, so an item deleted elsewhere is noticed.

## Minh's answers on 2026-10-08

- iPhone runs **iOS 27.0.1**.
- Apple Developer Program enrolment is **not started**.
- Minh **wants the CloudFront fallback fixed** for `/api/*` as a follow-up.

## Next steps

### 1. Decide how the app gets onto the iPhone (blocks Task 8)

The plan's Task 8 installs from local Xcode with free provisioning. Xcode 26.3 very likely cannot install to an iPhone on iOS 27 (an Xcode release normally supports devices up to its own iOS major version). Check first: connect the phone and run `xcrun devicectl list devices`, then try `cd mobile && bunx expo run:ios --device`. If Xcode refuses the device, the choices are:

- **TestFlight first (recommended).** Do Task 9 before Task 8 and run the device checklist on the TestFlight build. EAS builds in the cloud, so the Mac's Xcode does not matter. Needs the Apple Developer Program ($99/year). A TestFlight build has no dev server, so each fix found by the checklist costs another cloud build.
- **Upgrade macOS and Xcode.** Software Update offers macOS 27.0.1 on this MacBook Pro (M1 Pro). Xcode 27 can install to the phone, but whether Expo SDK 55 builds on Xcode 27 is unknown; the `AGENTS.md` note about Xcode would need rewriting, and SDK 57 becomes possible again.

### 2. Minh starts the Apple Developer Program enrolment

It can take a day or two and Task 9 waits on it. It is now on the critical path for Task 8 as well if TestFlight comes first.

### 3. Task 9: TestFlight

As in the plan, with these changes: read the EAS pages for the current CLI; the build profile should not assume SDK 57; check the EAS build image's default Xcode builds SDK 55 (set `image` in `eas.json` if needed). The two `EXPO_PUBLIC_KINDE_*` values go into EAS environment variables.

### 4. Task 8: device checklist

Run the plan's checklist on the phone. The parts never run anywhere yet: "Take photo" with the real camera, permission denial and "Open Settings", Airplane Mode during add (Review Focus 4), a second account on the same phone (Review Focus 1), Airplane Mode with pull to refresh (Review Focus 3), and staying signed in after a force-quit.

### 5. Task 10: documentation and merge

Write `docs/mobile.md` from what was built, not from the plan's template. It must say SDK 55 and include: the Xcode constraint, the Kinde peer warnings, `expo-build-properties`, the `expo/fetch` upload, the refresh limit, the CloudFront 404 masking, that a missing `mobile/.env.local` gives a blank screen, and that a Fast Refresh of `mobile/src/app/_layout.tsx` creates a second query cache (relaunch the app after editing it). Update `AGENTS.md` and the spec status as the plan says, and fix the plan's line 13, which points at an uncommitted `.superpowers` path.

### 6. Final whole-branch review, then merge

Review `main..feat/mobile-app` on the most capable model, pointing it at the ledger's "minor (deferred)" lines. The ones worth fixing before merge:

- `mobile/src/app/(tabs)/index.tsx` was reformatted with default prettier (semicolons, double quotes); restore the house style (no semicolons, single quotes).
- Tab bar shows placeholder triangle icons.
- Concurrent refused refreshes each call sign-out (several logout sheets).
- Editing: a failed save after a successful photo upload re-uploads on retry.
- Profile: a `null` profile is cached until sign-out; no double-tap guard on "Sign out".
- The app icon is still the Expo placeholder.

Ask Minh before pushing `main`.

### 7. Follow-up (separate from this plan): stop CloudFront masking API 404s

Today `GET https://stylify.space/api/nonexistent` returns `200 text/html`. The web app has the same latent bug as the phone had: a missing item's 404 reaches the browser as an HTML page. The distribution is `EIH8J5L7N96GZ`. Custom error responses apply to the whole distribution, so the usual fix is to remove the 403/404 → `/index.html` error responses and do the SPA rewrite in a CloudFront Function on the default (S3) behaviour only. This changes live infrastructure: write a short spec, check the web app's deep links still load, and get Minh's OK before changing anything. Keep `unmaskNotFound` in the app until the fix is live and verified, then decide whether to remove it.

## Running the app

```bash
cd mobile
bunx expo run:ios --device "iPhone 17"     # builds, starts Metro, opens the simulator
```

`mobile/.env.local` exists on this Mac (not in git). Kinde application "Stylify iOS" exists, authorised for the Stylify API, with `stylify://` as callback and logout redirect. CocoaPods 1.17.0 is installed. The app uses the production database and bucket; delete test items.

## Housekeeping

- Local branches `fix/bearer-503`, `feat/mobile-scaffold`, `feat/mobile-sdk55` and `docs/mobile-app-spec` are fully merged into `main` and can be deleted.
- This handoff file is uncommitted on `feat/mobile-app`.
