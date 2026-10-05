# Mobile Foundation — Design

Date: 2026-10-05
Status: awaiting review

## Goal

Add a native iPhone app to Stylify, next to the existing web app, that reaches feature parity with the web app today: sign in, list the wardrobe, add an item with a photo, edit, delete. Deliver it as a TestFlight build.

The app exists for three reasons: to learn React Native, to have a native app to show on a résumé, and because a wardrobe app is something people want on their phones.

## Context

- Stylify is live at stylify.space: React + Vite frontend on S3/CloudFront, Hono API on Lambda behind API Gateway, Neon Postgres, Kinde auth, S3 image storage. See `docs/cloud-architecture.md`.
- A refactor is staged but uncommitted on `main`: the shared Zod schema moves from `server/sharedTypes.ts` to a `shared/` Bun workspace (`@stylify/shared`), the Dockerfile installs from the root lockfile, and both CI workflows also trigger on `shared/**`.
- The repo has no tests.

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
| Framework | Expo, SDK 54 or later, development builds | `react-native-executorch` (planned for the classifier) requires SDK 54+, a development build, and iOS 17+ |
| Platform | iPhone only | One platform to test and one store review; avoid iOS-only libraries so Android stays possible |
| Routing | Expo Router | File-based, similar to TanStack Router |
| Styling | NativeWind | Reuses Tailwind knowledge |
| Server state | TanStack Query | Same as web |
| Forms | TanStack Form + `createItemSchema` from `@stylify/shared` | Same validation as web and server |
| API client | Hono RPC client (`hc<ApiRoutes>`) | Keeps calls typed end to end |
| Auth SDK | `@kinde/expo` (PKCE) | Kinde's supported Expo SDK |
| Distribution | TestFlight, then App Store | Apple Developer Program, $99/year |

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
2. The Expo app (Part 3 and `docs/mobile.md`) — written after plan 1 has shipped and the Kinde and Apple setup is done.

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

- Create a second application of type "Front-end and mobile" in the same Kinde business, with callback `stylify://callback` and a matching logout redirect. The same business means the same user ID on web and mobile, so one wardrobe per person.
- Register an API in Kinde with an audience (for example `https://stylify.space/api`) and authorise the mobile application for it.

### Middleware

`getUser` in `server/kinde.ts` gains a bearer path:

1. If the request has `Authorization: Bearer <token>`:
   - Verify the signature against Kinde's JWKS (`https://<KINDE_DOMAIN>/.well-known/jwks`), with the key set cached in memory.
   - Check issuer (`KINDE_DOMAIN`), audience (`KINDE_AUDIENCE`), and expiry.
   - Set `c.var.user` with `id` taken from the `sub` claim.
   - On any failure, return 401. Do not fall through to cookies.
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

### Screens

| Route | Screen | Behaviour |
|---|---|---|
| `/sign-in` | Sign in | One button; opens Kinde sign-in |
| `/(tabs)/` | Wardrobe | Photo grid, pull-to-refresh, skeletons while loading, empty state |
| `/(tabs)/add` | Add | Take or pick a photo; name, type, size, colour |
| `/item/[id]` | Edit | Pre-filled form; delete behind a confirmation |
| `/(tabs)/profile` | Profile | Name, email, picture, item count, sign out |

Signed-out users are redirected to `/sign-in`.

### API client

`mobile/lib/api.ts` creates `hc<ApiRoutes>` with base URL `https://stylify.space` and a fetch wrapper that attaches the bearer token. It defines the same `queryOptions` as the web app's `frontend/src/lib/api.ts`. The base URL comes from Expo config so a local backend can be used in development.

### Add-item flow

1. Take a photo (camera) or pick one (library) with `expo-image-picker`.
2. Resize and compress to JPEG on the device with `expo-image-manipulator`. The server names every object `.jpg`, and iPhone photos are often HEIC and several megabytes.
3. `GET /api/signed-url`, `PUT` the file to S3, `POST /api/wardrobe` with the resulting URL.
4. Write the new item into the query cache with `setQueryData`, as the web app does.

The S3 bucket's CORS rules apply to browsers only, so no bucket change is needed.

### Error handling

- 401 from the API: refresh the token once through the SDK and retry; if that fails, sign out to `/sign-in`.
- Upload or save failure: keep the form filled in, show the error, offer a retry.
- Lambda cold start: skeletons, never a blank screen.
- Camera or photo permission denied: explain and link to Settings.

### Testing

- Typecheck in `mobile/`.
- Manual checklist on a physical iPhone through a development build: sign in, see the same items as on the web, add with camera, add from library, edit, delete, sign out, sign back in.

### Release

Built on a feature branch. Development build on Minh's iPhone first, then an EAS Build submitted to TestFlight. Requires Apple Developer Program enrolment and an Expo account (manual, by Minh).

## Part 4: Documentation

- `AGENTS.md`: the single source of project instructions, covering all four workspaces, commands, patterns, and deploy rules.
- `CLAUDE.md`: imports `AGENTS.md` so the two cannot drift.
- `docs/mobile.md`: Expo setup, the auth flow, building and releasing.
- `docs/cloud-architecture.md`: fix the first-time setup commands (they say `us-east-2` and `stylify-backend`; the real values are `us-east-1` and `wardrobe-app`), update the Dockerfile snippet for workspaces, and complete the environment variable list (`GEMINI_API_KEY`, `AWS_BUCKET_NAME`, `AWS_BUCKET_REGION`, `FRONTEND_URL`, `KINDE_AUDIENCE`).

## Done means

- Both web workflows are green and stylify.space behaves as it does today.
- The middleware tests pass.
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

Still open, for plan 2:

- That `sub` in a mobile access token equals the `user.id` the cookie path produces for the same person. This needs a real mobile token.
- How `@kinde/expo` requests an audience (its README does not document it). Fallback: `expo-auth-session` directly, which Kinde's SDK is built on.
- Whether `react-native-executorch` supports Expo SDK 57; if not, the app starts on the newest SDK it does support.
- NativeWind's version for the chosen SDK.
- Xcode is not installed on Minh's Mac (command-line tools only), so device builds go through EAS Build in the cloud unless Xcode is installed.
