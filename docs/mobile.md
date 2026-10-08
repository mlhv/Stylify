# Mobile app

The iPhone app in `mobile/`: Expo SDK 55, Expo Router, NativeWind, the same Hono API as the web app. It is a Bun workspace beside `server/`, `frontend/` and `shared/`.

## Run it

- Needs Xcode and CocoaPods. From `mobile/`: `bunx expo run:ios --device "iPhone 17"` builds the app, starts Metro and opens it in the simulator.
- `mobile/.env.local` (not in git) holds `EXPO_PUBLIC_KINDE_DOMAIN` and `EXPO_PUBLIC_KINDE_CLIENT_ID`. `EXPO_PUBLIC_API_URL` is optional and points the app at a local API; the default is `https://stylify.space`. These values are read at build time and ship inside the app.
- **A missing `mobile/.env.local` gives a blank screen with no error.** The Kinde provider renders nothing without its settings.
- Checks, from `mobile/`: `bunx tsc --noEmit`, `bun test src`, `bunx expo export --platform ios`.
- The app talks to the production database and bucket. Delete test items.
- Editing `src/app/_layout.tsx` while the app runs: Fast Refresh re-runs that module and creates a second `QueryClient` (it is created at module scope), so lists stop updating after mutations. Relaunch the app after editing that file.

### Why SDK 55

The owner's Mac runs macOS Sequoia with Xcode 26.3 (Swift 6.2.4), the newest it supports. SDK 56 and later fail to compile `expo-modules-jsi` there (expo/expo #49941 and #50067). Upgrading the SDK needs a macOS and Xcode upgrade first.

- React is pinned to 19.2.0 to match SDK 55; see the React rule in `AGENTS.md`.
- `@kinde/expo` is 0.9.0. Its peer range names Expo 56 and 57, so `bun install` prints peer warnings. It works on SDK 55.
- The iOS deployment target, 17.0, is set through the `expo-build-properties` plugin in `app.json`. `ios.deploymentTarget` is not an `app.json` key on SDK 55.

## Auth

- Kinde application "Stylify iOS", authorised for the Stylify API. Callback and logout redirect: `stylify://`.
- The sign-in screen calls `login({ audience: 'https://stylify.space/api' })` (`src/lib/config.ts`). The audience must equal `KINDE_AUDIENCE` on the server. The access token goes out as `Authorization: Bearer`; the server reads only its `sub`.
- `src/lib/authFetch.ts` wraps every API request:
  - 401: one refresh, shared by all requests that fail together, then one retry. A failed refresh, a missing token after it, or a second 401 signs the user out.
  - 502, 503, 504 or no network: `ServerUnreachableError`. The user stays signed in and the screen offers a retry.
  - Requests that share a refresh also share its sign-out, so one ended session opens one logout.
- Server side, a bearer token that could not be checked (Kinde's keys could not be fetched, or `KINDE_AUDIENCE` is unset) is a 503, not a 401. See `server/auth/`.
- `src/components/AuthBridge.tsx` hands the Kinde functions to the module-level API client and clears the query cache when the session ends.
- The profile screen reads name, email and picture from the SDK, not from `/api/me`, because the bearer token carries only the user ID.

### Token refresh

The Kinde SDK's `refreshToken` never throws; it returns `{ success, error }`. `src/lib/refreshOutcome.ts` maps that result: success is "new token stored", an error that starts with `No access token received:` (the SDK's text for a failed network call) is "unreachable", so the user stays signed in, and anything else is "session over".

The mapping matches the SDK's error text and is pinned by `refreshOutcome.test.ts`. Re-check it when upgrading `@kinde/expo`.

## Screens and data

- Routes in `src/app/`: `sign-in`, `(tabs)/index` (wardrobe grid), `(tabs)/add`, `(tabs)/profile`, `item/[id]` (edit and delete). `_layout.tsx` is the auth guard (`Stack.Protected`).
- `src/lib/api.ts` mirrors `frontend/src/lib/api.ts`: the same query keys, and mutations write the server's response into the cache with `setQueryData`.
- The edit screen always refetches on open, so an item deleted elsewhere is noticed.
- Photos: picked with `expo-image-picker` (camera or library), re-encoded to JPEG with `expo-image-manipulator` (resized to a maximum width of 1600, quality 0.8; `src/lib/upload.ts`), then uploaded straight to S3 with a `PUT` using `fetch` from `expo/fetch` and a `File` body, at the presigned URL from `GET /api/signed-url`. SDK 55's `expo-file-system` has no `File.upload`. If a save fails after the upload, a retry reuses the uploaded photo (`src/lib/reuseUpload.ts`).

### CloudFront hides API 404s

The CloudFront distribution's SPA fallback turns any origin 404 into `200 text/html`, so a missing item arrives as a "successful" page. `src/lib/unmaskNotFound.ts` wraps the API client's fetch and turns a 2xx answer whose content type is not JSON back into a 404.

- Opening or saving a deleted item shows "This item no longer exists".
- Deleting an already-deleted item counts as done.

The web app has the same latent problem. The real fix is in the distribution (planned follow-up); `unmaskNotFound` stays until that is live.

## Release

TestFlight is not set up yet. There is no `eas.json`, and a TestFlight build needs Apple Developer Program enrolment first. Nothing has been built or submitted outside the simulator.

Nothing under `mobile/` triggers a deploy, and there is no CI for mobile.

## Known limits

- A Kinde 5xx during a token refresh still signs the user out, because the SDK does not distinguish it from a rejected token (see `refreshOutcome.ts`).
- The app icon is still the Expo placeholder.
- Not yet checked on a device: the camera, photo permission denial, Airplane Mode, a second account, and force-quitting the app. Where possible these have been run on the simulator only.
