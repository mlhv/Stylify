# Mobile Foundation — Design

Date: 2026-10-05
Status: Parts 1 and 2 shipped; Part 3 revised 2026-10-06, awaiting review

## Goal

Add a native iPhone app to Stylify, next to the existing web app, that reaches feature parity with the web app today: sign in, list the wardrobe, add an item with a photo, edit, delete. Deliver it as a TestFlight build.

The app exists for three reasons: to learn React Native, to have a native app to show on a résumé, and because a wardrobe app is something people want on their phones.

## Context

- Stylify is live at stylify.space: React + Vite frontend on S3/CloudFront, Hono API on Lambda behind API Gateway, Neon Postgres, Kinde auth, S3 image storage. See `docs/cloud-architecture.md`.
- When this spec was first written, the `shared/` workspace refactor was staged but uncommitted and the repo had no tests. Both changed with plan 1, which is live on `main`: `@stylify/shared`, bearer auth with tests in `server/auth/`, and the web app on React 19.2.3.

## Scope

In scope:

1. Finish and ship the staged workspace refactor.
2. Bearer-token auth on the backend, alongside the existing cookie auth.
3. An Expo app in `mobile/` with today's features, iPhone only.
4. Documentation: `AGENTS.md`, `CLAUDE.md`, `docs/mobile.md`, and fixes to `docs/cloud-architecture.md`.

Out of scope (each gets its own spec later):

- The PyTorch clothing classifier and snap-to-add.
- The web landing page and read-only demo.
- Outfit suggestions and wear tracking in the mobile app.
- Android.
- Restyling the logged-in web screens.
- An automated CI workflow for mobile builds.

## Decisions

| Decision | Choice | Reason |
|---|---|---|
| Web vs mobile | Add mobile; keep the web app | The web app is built, costs about $0.15/month, and is the only thing openable from a link |
| Framework | Expo SDK 57, development builds, iOS 17+ | The current template; `react-native-executorch` 0.10.4 (planned for the classifier) requires SDK 55+, a development build, the New Architecture and iOS 17+ |
| Platform | iPhone only | One platform to test and one store review; avoid iOS-only libraries so Android stays possible |
| Routing | Expo Router | File-based, similar to TanStack Router |
| Styling | NativeWind 4.2.7 (Tailwind 3); `StyleSheet` if it fails on SDK 57 | Reuses Tailwind knowledge on the stable release, with the same Tailwind major as the web app |
| Server state | TanStack Query | Same as web |
| Forms | TanStack Form + `createItemSchema` from `@stylify/shared` | Same validation as web and server |
| API client | Hono RPC client (`hc<ApiRoutes>`) | Keeps calls typed end to end |
| Auth SDK | `@kinde/expo` (PKCE) | Kinde's supported Expo SDK |
| Development builds | Local Xcode builds: simulator daily, Minh's iPhone with free provisioning for the camera | Fast iteration, and no paid account needed until release |
| Auth failures | 401 for a bad token, 503 when the token could not be checked | A Kinde outage must not sign mobile users out |
| Distribution | TestFlight through EAS, then App Store | Apple Developer Program, $99/year, needed only at this step |

## Repo layout

```
frontend/   existing web app (unchanged)
server/     Hono API (auth middleware changes)
shared/     Zod schemas and types
mobile/     new Expo app (new workspace)
```

`mobile` is a member of the root Bun `workspaces`, sharing the root lockfile. Tested in a throwaway copy on 2026-10-05; three things make that safe:

- **One React.** The web app moves to React 19.2.3, the exact version Expo SDK 57 uses, and the root `package.json` forces it with `overrides`. Without the override, Bun nests React 18 under two web libraries whose peer ranges stop at 18. From then on the web app's React version follows the Expo SDK's.
- **The backend image.** The Dockerfile copies every workspace manifest, including `mobile/package.json`, and installs with `--filter server`, which keeps React Native out of the image (112 packages in the test).
- **Deploy triggers.** `bun.lockb` is not a trigger for either workflow, so mobile dependency changes do not redeploy the web app or the API.

Neither existing workflow triggers on `mobile/**` or on the lockfile, so mobile changes cannot start a web or backend deploy.

## Plans

This spec is implemented by two plans:

1. `docs/superpowers/plans/2026-10-05-deployable-workspaces-and-bearer-auth.md` — Parts 1, 2, the web app's move to React 19, and the non-mobile docs in Part 4.
2. The Expo app (Part 3 and `docs/mobile.md`) — written after plan 1 has shipped. It starts with the 503 change to `server/auth/` described in Part 3.

## Part 1: Finish the workspace refactor

Verify before pushing:

1. `bun install --frozen-lockfile` at the root.
2. Frontend build (`cd frontend && bun run build`).
3. Typecheck of server and frontend.
4. Local Docker build of the server image (`--platform linux/amd64 --provenance=false`), then run the container and confirm `GET /api/me` returns 401.

Then commit, push to `main` (after confirming with Minh), watch both workflows, and run the smoke tests:

- `curl https://stylify.space/api/me` returns 401.
- `https://stylify.space` loads.
- Manual: log in, create, edit and delete an item, log out.

## Part 2: Backend bearer auth

### Kinde setup (manual, by Minh)

- Create a second application of type "Front-end and mobile" in the same Kinde business, with the callback and logout redirect the app really uses (Part 3, "Auth", gives the steps; the scheme is `stylify`). The same business means the same user ID on web and mobile, so one wardrobe per person.
- Register an API in Kinde with an audience (for example `https://stylify.space/api`) and authorise the mobile application for it.

### Middleware

`getUser` in `server/kinde.ts` gains a bearer path:

1. If the request has `Authorization: Bearer <token>`:
   - Verify the signature against Kinde's JWKS (`https://<KINDE_DOMAIN>/.well-known/jwks`), with the key set cached in memory.
   - Check issuer (`KINDE_DOMAIN`), audience (`KINDE_AUDIENCE`), and expiry.
   - Set `c.var.user` with `id` taken from the `sub` claim.
   - On any failure, return 401. Do not fall through to cookies. (Part 3 later splits out 503 for a token that could not be checked.)
2. If there is no bearer header, run today's cookie logic unchanged.

Routes use only `user.id`, so the bearer path does not fetch a profile from Kinde. The type of `c.var.user` is narrowed to what both paths can supply; `/api/me` keeps returning the full profile on the cookie path and returns the token-derived fields on the bearer path. The mobile profile screen reads name, email and picture from the SDK.

New Lambda environment variable: `KINDE_AUDIENCE`. It must be set before the backend deploy that needs it.

### Tests

First tests in the repo, run with `bun test`, using a locally generated key pair in place of Kinde's JWKS:

- Valid token: request passes and `user.id` equals `sub`.
- Expired token: 401.
- Wrong issuer: 401.
- Wrong audience: 401.
- Bad signature: 401.
- No bearer header: cookie path runs.

The live web app is the regression check for the cookie path after deploy.

## Part 3: The Expo app

Revised 2026-10-06 after plan 1 shipped. The facts marked "verified" come from a throwaway copy of the repo on 2026-10-05; nothing has yet run on a device or simulator.

### Project shape

- Created with `bunx create-expo-app@latest mobile --template default`: Expo SDK 57, React 19.2.3, React Native 0.86.3, source under `mobile/src/`. Delete the `mobile/.git` the template creates.
- `scheme`: `stylify`. Bundle identifier: `space.stylify.app`. Minimum iOS: 17. New Architecture on. Development builds only; Expo Go is not used. These match what `react-native-executorch` needs for the classifier spec.
- React stays at 19.2.3, so the pin in `frontend/package.json` and the root `overrides` does not change.
- `mobile/tsconfig.json` adds `"@server/*": ["../server/*"]` to `paths`, and `mobile` depends on `hono` and `@stylify/shared` (verified: typechecks and bundles with no Metro changes).

### Backend change first: 503 for "could not verify"

Today every bearer failure is a 401, including Kinde's key server being unreachable and missing configuration. The app signs out on a 401 that survives a refresh, so a Kinde outage would sign users out.

- `server/auth/bearer.ts` throws a second error type when the token could not be checked at all: the key set could not be fetched, or `KINDE_DOMAIN` / `KINDE_AUDIENCE` / the key set is missing.
- `getUser` answers 503 for that error and 401 for every other bearer failure. Neither falls back to cookies.
- Tests: the existing "network down" and "not configured" cases now expect the new error; new `getUser` tests expect 503 for it and 401 for a bad token.

This ships to `main` on its own, before the app depends on it.

### Workspace and CI second

- Add `mobile` to the root `workspaces`; run `bun install`; commit `bun.lockb`.
- `server/Dockerfile`: copy `mobile/package.json` with the other manifests.
- `.dockerignore`: add `mobile/.expo`, `mobile/ios`, `mobile/android` and `mobile/dist`, without excluding `mobile/package.json`.
- Both deploy workflows install with `--filter` so that neither installs React Native.
- No workflow triggers on `mobile/**`.

Adding a workspace edits the root `package.json`, which triggers both deploys. Before that push: build the image, confirm `GET /api/me` returns 401 from the container, and run the frontend typecheck and build. After it: the smoke test in `AGENTS.md`.

### Styling

NativeWind 4.2.7 with Tailwind 3, the same Tailwind major as the web app. Its support for Expo SDK 57 is not confirmed, so the scaffold task renders one NativeWind-styled screen in the simulator before anything is built on it. If that fails, the app uses React Native's `StyleSheet` instead and NativeWind is removed; the toolchain is not debugged.

### Building and running

| Stage | How | Needs |
|---|---|---|
| Daily development | Local development build (`expo run:ios`) in the iOS Simulator | Xcode, installed by Minh |
| Camera and the device checklist | The same build installed on Minh's iPhone with free provisioning; it expires after 7 days and is reinstalled | A free Apple ID |
| TestFlight | EAS Build and EAS Submit | Apple Developer Program enrolment and an Expo account |

Enrolment can take a day or two, so Minh starts it once edit and delete work, not on release day.

### Screens

| Route | Screen | Behaviour |
|---|---|---|
| `/sign-in` | Sign in | One button; opens Kinde sign-in |
| `/(tabs)/` | Wardrobe | Photo grid, pull-to-refresh, skeletons while loading, empty state |
| `/(tabs)/add` | Add | Take or pick a photo; name, type, size, colour |
| `/item/[id]` | Edit | Pre-filled form; delete behind a confirmation |
| `/(tabs)/profile` | Profile | Name, email, picture, item count, sign out |

Signed-out users are redirected to `/sign-in`. The profile screen reads name, email and picture from the Kinde SDK (`getUserProfile()`), because a bearer token carries only the user ID; the item count comes from the wardrobe query.

### Auth

1. The app prints the redirect URI it will really use (from Expo's `makeRedirectUri` with the `stylify` scheme). Minh then creates a Kinde application of type "Front-end and mobile" in the same business, adds that URI as the callback and logout redirect, and authorises the application for the `Stylify API`.
2. Sign-in calls `login({ audience: 'https://stylify.space/api' })` from `@kinde/expo` 0.9.0.
3. Before any other screen is built, a temporary debug screen proves two things with a real token:
   - the access token's `aud` contains `https://stylify.space/api`;
   - `GET /api/me` with the bearer token returns the same user ID that the web app's `/api/me` returns for the same person.

If the audience is missing, switch to `expo-auth-session` directly, which the Kinde SDK is built on. If the user IDs differ, stop: web and mobile would have separate wardrobes and this design needs rework.

### API client

`mobile/src/lib/api.ts` creates `hc<ApiRoutes>` with a fetch wrapper and defines the same `queryOptions` as `frontend/src/lib/api.ts`.

- Base URL: `https://stylify.space`, or `EXPO_PUBLIC_API_URL` when set, for a local backend.
- The wrapper attaches `Authorization: Bearer <access token>`.
- 401: refresh the token once through the SDK and retry the request once. If the retry is also 401, or the refresh fails, sign out to `/sign-in`.
- 503 or a network failure: stay signed in and show "Can't reach the server" with a retry.

The wrapper takes its token functions as arguments so its retry rules can be unit tested without the SDK.

### Add-item flow

1. Take a photo (camera) or pick one (library) with `expo-image-picker`.
2. Resize and compress to JPEG on the device with `expo-image-manipulator`. The server names every object `.jpg`, and iPhone photos are often HEIC and several megabytes.
3. `GET /api/signed-url`, `PUT` the file to S3, `POST /api/wardrobe` with the resulting URL.
4. Write the new item into the query cache with `setQueryData`, as the web app does.

The form is TanStack Form validated by `createItemSchema`. The S3 bucket's CORS rules apply to browsers only, so no bucket change is needed. How the file body is sent in the `PUT` from React Native is settled in the plan against the SDK 57 docs.

### Error handling

- 401, 503 and network failures: as under "API client".
- Upload or save failure: keep the form filled in, show the error, offer a retry.
- Lambda cold start: skeletons, never a blank screen.
- Camera or photo permission denied: explain and link to Settings.

### Testing

- `bun test` for the fetch wrapper: token attached; 401 then refresh then success; 401 twice signs out; failed refresh signs out; 503 does not sign out.
- Typecheck in `mobile/`, and `bunx expo export --platform ios` to prove the bundle builds.
- Each screen is checked in the simulator as it is built.
- Manual checklist on Minh's iPhone: sign in, see the same items as on the web, add with camera, add from library, edit, delete, sign out, sign back in.

Local development uses the production database and image bucket, so every test item is deleted afterwards.

### Order of work

1. The 503 change (deploys the API).
2. Scaffold `mobile/` as a workspace, with the CI and Docker changes and the NativeWind proof (deploys web and API).
3. Kinde mobile application, sign-in, and the token check.
4. API client and the wardrobe grid.
5. Add with a photo.
6. Edit and delete.
7. Profile.
8. Device checklist on the iPhone.
9. Apple enrolment, EAS Build, TestFlight.
10. `docs/mobile.md` and the `AGENTS.md` update.

Steps 1 and 2 are pushed to `main` with Minh's agreement. Steps 3 to 10 are built on a feature branch; nothing in `mobile/` triggers a deploy.

### Release

EAS Build submitted to TestFlight. Requires Apple Developer Program enrolment and an Expo account (manual, by Minh).

## Part 4: Documentation

- `AGENTS.md`: the single source of project instructions, covering all four workspaces, commands, patterns, and deploy rules.
- `CLAUDE.md`: imports `AGENTS.md` so the two cannot drift.
- `docs/mobile.md`: Expo setup, the auth flow, building and releasing.
- `docs/cloud-architecture.md`: fix the first-time setup commands (they say `us-east-2` and `stylify-backend`; the real values are `us-east-1` and `wardrobe-app`), update the Dockerfile snippet for workspaces, and complete the environment variable list (`GEMINI_API_KEY`, `AWS_BUCKET_NAME`, `AWS_BUCKET_REGION`, `FRONTEND_URL`, `KINDE_AUDIENCE`).

## Done means

- Both web workflows are green and stylify.space behaves as it does today.
- The middleware tests pass.
- A bearer request gets 503, not 401, when Kinde's key set cannot be reached.
- A TestFlight build lets Minh sign in, see the same wardrobe as on the web, and add, edit and delete an item with a photo from the camera.
- The docs above are written and match the repo.

## Future work

### End goal

Stylify is a native iPhone wardrobe app, on the App Store, where adding an item is: open the camera, take a photo, and a classifier Minh trained in PyTorch fills in the item type on the device. The web app stays live at stylify.space as the public face of the project: a landing page, a read-only demo anyone can open from a link, and the existing logged-in app. One Hono API, one database and one Kinde user serve both.

The project serves as a portfolio piece first (web link plus App Store link, showing full-stack, native mobile and ML work) and as an app Minh uses daily second.

### Next specs, in order

Each gets its own spec, plan and build. The order can change; the classifier's training work is independent Python and can start at any time.

1. **Clothing classifier and snap-to-add.**
   - Training: fine-tune a small pretrained network (for example MobileNetV3 or EfficientNet) in PyTorch on a clothing dataset of real photos. Fashion-MNIST is too toy-like to transfer. Expect a gap between product shots and photos of clothes on a bed or hanger; the label set should match the `type` values the app uses.
   - Export with ExecuTorch and run on the device through `react-native-executorch`. To verify first: how that library loads a custom-trained model. Fallback: `onnxruntime-react-native`.
   - In the app: take a photo, the model pre-fills the type, the user confirms or corrects it. The model never adds an item silently.
   - Open questions: where the training code lives (a `ml/` directory here or a separate repo), how the model file is shipped (bundled or downloaded), and whether corrections are logged for retraining.

2. **Web landing page and read-only demo.**
   - Logged-out visitors to stylify.space see a landing page: what the app is, screenshots, the tech stack, an App Store link, and a sign-in button.
   - "Try the demo" opens a sample wardrobe with no login, served from seeded demo data, read-only.
   - The logged-in web screens are not restyled.
   - Open question: whether demo data comes from a public API route or is bundled into the frontend.

3. **Daily-use features in the mobile app.**
   - Outfit suggestions: the backend route exists (`GET /api/recommendations`, Gemini plus Open-Meteo weather); the web page for it is a stub. Build the mobile screen using device location.
   - Wear tracking: `lastWornAt` and `POST /api/wardrobe/:id/worn` exist with no UI. Add "wore this today" and show last-worn on items.
   - Search, filter and sort on the wardrobe grid.

Later, not yet planned: Android, a CI workflow for mobile builds, making the web app installable as a PWA.

## To verify during planning

Resolved on 2026-10-05:

- The staged refactor is not deployable as it stands: the staged `bun.lockb` fails `bun install --frozen-lockfile`, and the Dockerfile omits `frontend/package.json`, so the image build fails with `Workspace not found "frontend"`. Plan 1 fixes both.
- `bun install --production --frozen-lockfile --filter server`, with all three workspace manifests present and a regenerated lockfile, installs only the server's dependencies (114 packages) and links `@stylify/shared`.
- Kinde access tokens: `iss` is `https://<subdomain>.kinde.com` with no trailing slash, `aud` is an array, `sub` is the user ID, and there is no email or name. JWKS is at `https://<subdomain>.kinde.com/.well-known/jwks`.
- Current Expo template: SDK 57, React 19.2, React Native 0.86, source under `src/app`. `@kinde/expo` 0.9.0 supports Expo 56 and 57.

Resolved on 2026-10-06, for plan 2:

- `@kinde/expo` 0.9.0 accepts `login({ audience })` in its types. Whether the issued token carries the audience is checked on a device in Part 3.
- `react-native-executorch` 0.10.4 supports Expo SDK 55 and later, so the app starts on SDK 57.
- Styling: NativeWind 4.2.7, proven in the scaffold task, with `StyleSheet` as the fallback.
- An unreachable key set returns 503, not 401.
- Both deploy workflows install with `--filter`, and `.dockerignore` gains the mobile build directories, in the scaffold task.
- The frontend typecheck is repaired and runs in CI.
- Minh installs Xcode; EAS Build is used only for TestFlight.

Still open, checked during plan 2 with a real token:

- That `sub` in a mobile access token equals the `user.id` the cookie path produces for the same person.
- That the access token's `aud` contains `https://stylify.space/api`.
- That NativeWind 4.2.7 renders on Expo SDK 57.
