# Mobile app

The iPhone app in `mobile/`: Expo SDK 55, Expo Router, NativeWind, the same Hono API as the web app. It is a Bun workspace beside `server/`, `frontend/` and `shared/`.

## Run it

- Needs Xcode and CocoaPods. From `mobile/`: `bunx expo run:ios --device "iPhone 17"` builds the app, starts Metro and opens it in the simulator. The app has no `expo-dev-client`; `expo run:ios` builds a plain debug app that loads its JavaScript from Metro.
- `mobile/.env.local` (not in git) holds `EXPO_PUBLIC_KINDE_DOMAIN` and `EXPO_PUBLIC_KINDE_CLIENT_ID`. `EXPO_PUBLIC_API_URL` is optional and points the app at a local API; the default is `https://stylify.space`. These values are read at build time and ship inside the app.
- **A missing `mobile/.env.local` makes the app fail at startup.** `KindeAuthProvider` throws `config.domain prop is undefined` while rendering (and `config.clientId prop is undefined` for the client ID); this is from the SDK source (`dist/index.mjs`), not observed on a device.
- Checks, from `mobile/`: `bunx tsc --noEmit`, `bun test src`, `bunx expo export --platform ios`.
- The app talks to the production database and bucket. Delete test items.
- Editing `src/app/_layout.tsx` while the app runs: Fast Refresh re-runs that module and creates a second `QueryClient` (it is created at module scope), so lists stop updating after mutations. Relaunch the app after editing that file.

### On an iPhone

The app is installed from Xcode with free provisioning, no Apple Developer Program. This works on Xcode 26.3 although the owner's iPhone runs iOS 27.0.1.

One-time setup:

- Xcode → Settings → Accounts: add the Apple ID.
- Open `mobile/ios/Stylify.xcworkspace` → target "Stylify" → Signing & Capabilities → "Automatically manage signing", Team = the personal team. `mobile/ios` is generated and git-ignored, so `expo prebuild --clean` loses this setting; set it again.
- On the iPhone: Settings → Privacy & Security → Developer Mode.

Install, from `mobile/`:

```bash
xcrun devicectl list devices                 # name and UDID of the phone
bunx expo run:ios --device "<name or UDID>"
```

`--no-bundler` installs without starting Metro; run `bunx expo start` afterwards to serve the app.

- **Trust the developer** on first launch: Settings → General → VPN & Device Management. Until then the launch fails with "invalid code signature ... not been explicitly trusted".
- **The build expires after 7 days.** Run the install command again to renew it.
- **The phone must reach Metro on the Mac:** same Wi-Fi, and Local Network allowed for Stylify (Settings → Privacy & Security → Local Network). Otherwise the app shows a red "No script URL provided" banner. The Mac's address is baked into the build, so a changed network needs a rebuild. Networks that block device-to-device traffic (common on university and office Wi-Fi) do not work; a personal hotspot does.

### ExecuTorch and the model

- `mobile/package.json` has a `postinstall` (`scripts/executorch-libs.cjs`) that runs `react-native-executorch`'s `download-libs.js` with the `"react-native-executorch"` block (`features: ["classification"]`) in that file. Bun does not run dependencies' postinstalls, so this is how the prebuilt ExecuTorch binaries (about 175 MB in `node_modules/react-native-executorch/third-party/`) get downloaded. The filtered server and web installs do not run it.
- The classifier lives in `mobile/assets/model/` (`classifier.pte`, `classifier.json`); Metro treats `.pte` as an asset.
- `react-native-worklets` and `react-native-reanimated` are newer than SDK 55 expects; see `AGENTS.md`.

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
  - Requests that share a refresh also share its sign-out, so one ended session signs out once.
- Server side, a bearer token that could not be checked (Kinde's keys could not be fetched, or `KINDE_AUDIENCE` is unset) is a 503, not a 401. See `server/auth/`.
- Sign-out (the Profile button and the automatic path) goes through `src/lib/endSession.ts` and opens no browser. The SDK's `logout` always opens a web-auth session (a sheet, plus iOS's "wants to use ... to sign in" prompt), so the app does the local half itself (`src/lib/kindeSession.ts`): it removes the access, ID and refresh tokens from the SDK's storage (`getActiveStorage` from `@kinde/js-utils`), remounts `KindeAuthProvider` (`src/lib/authReset.ts`, used as its `key`) because the provider's signed-in flag can only be reset that way, and revokes the refresh token at Kinde in the background (best effort; a failure never blocks sign-out). The root layout (`src/app/_layout.tsx`) keeps a white view mounted outside the keyed provider, so the provider's restart does not flash the black native window. Kinde's browser cookie is left alone, which is safe because the SDK's `login` always sends `prompt=login`, so the next person sees the login form and signs in as themselves. `@kinde/js-utils` is a declared, exactly pinned dependency of `mobile`; it must equal the version `@kinde/expo` pins and be bumped together with it (`kindeSession.test.ts` fails if the versions differ or if the app and the SDK resolve different copies). Re-check `endSession.ts`, `kindeSession.ts` and `authReset.ts` against `@kinde/expo`'s `logout` (`dist/index.mjs`) whenever the SDK is upgraded.
- A stored session opens the app offline. The SDK sets `isAuthenticated` only after a network refresh succeeds at start, so offline or during a Kinde outage it stays false although the tokens are on the device. `src/lib/sessionState.ts` therefore treats a stored refresh token (`hasStoredRefreshToken` in `kindeSession.ts`, read by `useSessionState.ts`) as signed in. The app opens on the tabs; the wardrobe shows "Can't reach the server" with a retry, and the retry works once the network is back. `getAccessToken`, `refreshToken` and `getUserProfile` read the SDK's storage directly (they do not depend on `isAuthenticated`), so they serve the stored session. If Kinde refuses the stored refresh token, the tabs show first and keep working until the stored access token expires; the next 401 runs the normal sign-out and the user lands on sign-in. With no stored token the app shows sign-in. The check starts again whenever the provider remounts, so it never carries over a sign-out. While it runs the white view stays up.
- `src/components/AuthBridge.tsx` hands the Kinde functions to the module-level API client and clears the query cache when the session ends.
- The profile screen reads name, email and picture from the SDK, not from `/api/me`, because the bearer token carries only the user ID.

### Token refresh

The Kinde SDK's `refreshToken` never throws; it returns `{ success, error }`. `src/lib/refreshOutcome.ts` maps that result: success is "new token stored", an error that starts with `No access token received:` (the SDK's text for a failed network call) is "unreachable", so the user stays signed in, and anything else is "session over".

The mapping matches the SDK's error text and is pinned by `refreshOutcome.test.ts`. Re-check it when upgrading `@kinde/expo`.

## Screens and data

- Routes in `src/app/`: `sign-in`, `(tabs)/index` (wardrobe grid), `(tabs)/add`, `(tabs)/profile`, `item/[id]` (edit and delete). `_layout.tsx` is the auth guard (`Stack.Protected`).
- `src/lib/api.ts` mirrors `frontend/src/lib/api.ts`: the same query keys for items (only `get-all-items`, `get-total-clothes` and `get-item` overlap), and mutations write the server's response into the cache with `setQueryData`.
- The edit screen always refetches on open, so an item deleted elsewhere is noticed.
- The Add tab's header has a back control to Wardrobe (`src/app/(tabs)/_layout.tsx`). Tab bar icons are Ionicons from `@expo/vector-icons`, which comes with `expo` and is not declared in `mobile/package.json`.
- The item form (`src/components/ItemForm.tsx`) handles the keyboard itself: while it is up, a spacer as tall as the part of the scroll view it covers is added, so the submit button and "Delete item" can be scrolled above it, the focused field is kept in view, and scrolling never closes the keyboard. React Native's `automaticallyAdjustKeyboardInsets` was not enough on the phone.
- Photos: picked with `expo-image-picker` (camera or library), re-encoded to JPEG with `expo-image-manipulator` (resized to a maximum width of 1600, quality 0.8; `src/lib/upload.ts`), then uploaded straight to S3 with a `PUT` using `fetch` from `expo/fetch` and a `File` body, at the presigned URL from `GET /api/signed-url`. SDK 55's `expo-file-system` has no `File.upload`. If a save fails after the upload, a retry reuses the uploaded photo (`src/lib/reuseUpload.ts`).

### Missing items and `unmaskNotFound`

Until 2026-10-13 the CloudFront distribution turned any origin 404 into `200 text/html`, so a missing item arrived as a "successful" page. That was fixed in the distribution (see `docs/cloud-architecture.md`, "SPA Routing Configuration"): a missing item now answers 404. `src/lib/unmaskNotFound.ts` still wraps the API client's fetch and turns a 2xx answer whose content type is not JSON back into a 404; it is a guard against the masking coming back and does nothing while API 404s arrive as 404.

- Opening or saving a deleted item shows "This item no longer exists".
- Deleting an already-deleted item counts as done.

Removing `unmaskNotFound` is a possible clean-up, not a requirement.

## Release

There is no TestFlight and no EAS: no `eas.json`, no Apple Developer Program enrolment (the owner dropped TestFlight on 2026-10-08). The app is distributed only by installing it from Xcode onto the owner's iPhone (see "On an iPhone"). TestFlight would need the Apple Developer Program and an EAS build profile.

Nothing under `mobile/` triggers a deploy, and there is no CI for mobile.

## Known limits

- Checked on a device on 2026-10-08 (iPhone 13 Pro, iOS 27.0.1): sign-in and wardrobe match the web; add with the camera and with the library; permission denial alert and "Open Settings"; edit name and photo; Airplane Mode during add, then retry saves once; delete; an item deleted on the web shows "This item no longer exists"; a second account sees an empty wardrobe; still signed in after force-quit. Airplane Mode with pull to refresh: the grid stays, no error is shown, and the user stays signed in.
- A Kinde 5xx during a token refresh still signs the user out, because the SDK does not distinguish it from a rejected token (see `refreshOutcome.ts`).
- When a refresh fails offline while cached items are shown, the grid simply stays; no message says it is stale.
- A token refresh in flight at the moment of sign-out can store the previous session's tokens again, so the next launch would be signed in. Very unlikely; not handled.
- Sign-out does not end Kinde's browser session: it removes the tokens and revokes the refresh token best-effort, and the next sign-in always shows the login form (`prompt=login`).
- Offline with a stored session the profile screen shows whatever the stored ID token holds (it decodes the token and never fetches a profile); if the token is missing it shows its error state with a retry.
- A 401 that arrives after sign-out has finished runs sign-out a second time. It is harmless and does not loop.
- The Android icon images are still the Expo placeholders. The splash screen shows `mobile/assets/images/splash-icon.png` (the hanger cut out on a transparent background) on white. The iOS app icon is `mobile/assets/images/icon.png` (1024 × 1024, no alpha); after changing it, run `bunx expo prebuild -p ios --clean` and reinstall. A prebuild without `--clean` keeps the old icon reference in the generated project, so the home screen icon does not change. With one signing identity on the Mac, `expo run:ios --device` picks the team again by itself.
- Free-provisioning builds expire after 7 days.
