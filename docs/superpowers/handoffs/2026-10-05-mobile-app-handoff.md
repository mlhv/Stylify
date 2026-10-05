# Handoff: Stylify mobile app (spec and plan)

Written 2026-10-05 for a new session. Your job: write the implementation plan for the Expo iPhone app (updating the spec first where this document says a decision is open), get Minh's approval, then execute it.

## Read first

1. `AGENTS.md` — repo layout, commands, and the rules that are easy to break.
2. `docs/superpowers/specs/2026-10-05-mobile-foundation-design.md` — the approved design. Part 3 (the Expo app) and `docs/mobile.md` in Part 4 are what remain. Its "Future work" section holds the roadmap after this.
3. `docs/superpowers/plans/2026-10-05-deployable-workspaces-and-bearer-auth.md` — the finished first plan, useful as a model for task shape and for what the backend now does.

## Where things stand

`main` is at `b405988`, deployed, and green. Done and live:

- `shared/` workspace (`@stylify/shared`) with the Zod schemas.
- Web app on React 19.2.3, forced to one copy by `overrides` in the root `package.json`.
- Bearer auth: `getUser` accepts `Authorization: Bearer <Kinde access token>` alongside cookies. Code and 29 tests are in `server/auth/` and `server/kinde.test.ts`.
- `KINDE_AUDIENCE=https://stylify.space/api` is set on the Lambda and in Minh's local `.env`. The API is registered in Kinde with that audience.
- CloudFront `/api/*` uses `CachingDisabled` and `AllViewerExceptHostHeader`, and forwards the `Authorization` header.
- Frontend typecheck works and runs in CI before the build.

Not done: no `mobile/` directory exists. No valid bearer token has ever been verified end to end; every bearer request so far was garbage and correctly got `401 {"error":"Invalid token"}`.

## Decisions already made (do not reopen without a reason)

- Add an Expo app next to the web app; not a migration, not mobile-only. Do not restyle the logged-in web screens.
- iPhone only for now. Avoid iOS-only libraries so Android stays possible.
- Minh will pay for the Apple Developer Program ($99/year); distribution is TestFlight, then the App Store.
- `mobile/` is a member of the root Bun workspace (Minh's explicit choice), sharing the root `bun.lockb`.
- Stack in the spec: Expo Router, TanStack Query, TanStack Form with `createItemSchema`, the typed Hono client, `@kinde/expo`, NativeWind (see the open item on NativeWind below).
- First version reaches parity with the web app: sign in, wardrobe list, add with a photo (camera or library), edit, delete, profile. The classifier, landing page, and daily-use features are later specs.
- Gemini outfit recommendations are deferred until after the mobile app. `GEMINI_API_KEY` is not set on the Lambda.

## Verified on 2026-10-05 in a throwaway copy of the repo

A fresh Expo app (`bunx create-expo-app@latest mobile --template default`) was added as a fourth workspace in a scratch copy. Results:

| Question | Result |
|---|---|
| Current template | Expo SDK 57, React 19.2.3, React Native 0.86.3, TypeScript ~6.0.3, source under `src/app`, `scheme` set in `app.json` |
| One React across the workspace | Yes: a single `react` 19.2.3 at the root after `bun install` |
| Web app unaffected | Frontend typecheck, frontend build and the 29 server tests all pass with `mobile` in the workspace |
| Typed API client from `mobile/` | `hc<ApiRoutes>` typechecks with `"@server/*": ["../server/*"]` added to `mobile/tsconfig.json` paths and `hono` as a dependency; one hoisted `hono` copy, so no duplicate-type problem |
| Shared package in the bundle | `bunx expo export --platform ios` succeeds with `@stylify/shared` and the API client imported; no Metro config changes needed |
| Backend image with four workspaces | `bun install --production --frozen-lockfile --filter server` installs 61 top-level packages, no `react-native` or `expo`, provided `mobile/package.json` is copied in |
| `@kinde/expo` | 0.9.0, peers Expo 56 or 57. `login(options)` accepts `audience` (type `LoginMethodParams`). The hook exposes `getAccessToken()`, `getIdToken()`, `getUserProfile()`, `refreshToken`, `isAuthenticated`, `isLoading`. Redirect URI comes from Expo's `makeRedirectUri` and needs `expo.scheme`, or pass `redirectURL` to `login` |
| `react-native-executorch` (for the later classifier) | 0.10.4. Docs require React Native 0.83+, Expo SDK 55+, a development build (no Expo Go), the New Architecture, iOS 17+. Peer `react-native-worklets >=0.10.0 <0.13.0`; the template ships 0.10.1 |

Two template quirks seen: `create-expo-app` runs `git init` inside the new folder (delete `mobile/.git`), and a fresh `tsc --noEmit` reports two CSS-module errors until Expo generates its env types.

What these tests do not show: anything running on a device or simulator. Bundling and typechecking passed; sign-in, the camera, and uploads are untested.

## Still open

1. **Kinde mobile application.** Only the web application exists and is authorised for the API. Minh must create a second application of type "Front-end and mobile" in the same Kinde business, add the callback and logout redirect URLs the app will use, and authorise it for the `Stylify API`. The exact redirect URI depends on the app's `scheme`; decide the scheme first (the spec suggests `stylify`), then give Minh the exact strings.
2. **`sub` equals the cookie path's `user.id`.** Needs a real mobile token. Make it an early task: sign in on mobile, call `/api/me`, and compare with the web user's ID. If they differ, the wardrobes would not be shared and the design needs rework.
3. **Audience at runtime.** The types accept `login({ audience })`; confirm the issued access token really has `aud` containing `https://stylify.space/api`. Fallback: `expo-auth-session` directly, which the Kinde SDK is built on.
4. **401 versus 503.** Today every bearer failure is 401, including Kinde's key server being unreachable. The spec's mobile rule is "401: refresh once, else sign out", so a Kinde outage would sign users out. Decide whether `server/auth/` should answer 503 for "could not verify", before the app depends on it.
5. **NativeWind.** Latest stable is 4.2.7 (v5 is a release candidate). Its compatibility with Expo SDK 57 and Reanimated 4 was not checked, and the SDK 57 template already uses CSS files. Check the versioned docs and choose: NativeWind, or the template's own styling.
6. **Device builds.** Xcode is not installed on Minh's Mac (command-line tools only). Development builds for a physical iPhone can come from EAS Build in the cloud, which needs the Apple Developer account. Installing Xcode adds the iOS Simulator and local builds. Ask Minh which route they want.
7. **CI when `mobile` joins.** Add `COPY mobile/package.json ./mobile/` to `server/Dockerfile`; add `mobile` build directories to `.dockerignore` without excluding `mobile/package.json`; install with `--filter` in both deploy workflows so web deploys do not install React Native. `bun.lockb` is deliberately not a deploy trigger, but adding a workspace edits the root `package.json`, which is, so that commit deploys both web and API.
8. **React version coupling.** The web app's React must equal the Expo SDK's. If the plan chooses an SDK other than 57, the pin in `frontend/package.json` and root `overrides` changes with it, and the web app needs a browser check.

## How Minh works

- Ask before every push to `main`; each one deploys the live site. Work on a branch and fast-forward.
- Minh does the browser checks; give exact steps. Local dev uses the production database and image bucket, so test items must be deleted afterwards.
- Minh chose subagent-driven execution for the first plan.
- The AWS CLI signs in with `aws login` and the session expires. Symptom: local `GET /api/signed-url` returns 500 with `CredentialsProviderError`. Fix: Minh runs `aws login`, then restart the local API server.
- Docker runs through OrbStack, which may need starting (`orb start`).
- The Expo template's own `AGENTS.md` warns that Expo APIs change every SDK release: read the versioned docs at `https://docs.expo.dev/versions/v57.0.0/` before writing Expo code, and verify app code by typechecking and bundling it.

## Suggested first steps

1. Read the three documents above.
2. Settle open items 5 and 6 with Minh, and item 4 if it affects the plan.
3. Update Part 3 of the spec with those decisions and the verified facts here; get Minh's review.
4. Write the plan. Suggested task order: scaffold `mobile/` as a workspace with the CI and Docker changes (and prove the web deploy still works); Kinde mobile application and sign-in; the token check in open item 2; API client and wardrobe list; add with photo; edit and delete; profile; TestFlight build; `docs/mobile.md` and `AGENTS.md` updates.
