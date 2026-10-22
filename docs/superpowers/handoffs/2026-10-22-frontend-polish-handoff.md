# Handoff: polish the web and iPhone frontends

Date: 2026-10-22
Next step: make both frontends (the web app in `frontend/` and the iPhone app in `mobile/`) look high quality and polished, and check every change visually before calling it done. Start with superpowers:brainstorming to agree a design direction with Minh, then write a spec and a plan as usual.

Earlier handoffs are superseded. `AGENTS.md`, `docs/frontend.md` and `docs/mobile.md` describe the code as it is.

## Where things stand

| Area | State |
|---|---|
| `main` | b4a161f, pushed 2026-10-22 (no deploy: only `ml/`, `mobile/`, `docs/`). No open branches. |
| Web app | Live at https://stylify.space. React 19.2.0, Vite 5, TanStack Router and Query, Tailwind 3 with shadcn-style components in `frontend/src/components/ui/` (avatar, badge, button, card, input, label, sheet, skeleton, sonner), `framer-motion`, `lucide-react`, `next-themes`. Routes: `__root.tsx`, `about.tsx`, `_authenticated.tsx` (inline login guard), `_authenticated/` `index`, `create-item`, `edit-item.$id`, `outfit-suggestions`, `profile`. |
| iPhone app | Expo SDK 55, NativeWind 4.2.7, Expo Router. Screens: `sign-in`, tabs `index` (wardrobe grid), `add`, `profile`, and `item/[id]` (edit). `ItemForm.tsx` now has the classifier's "Identifying…" line and type chips. Plain neutral styling (`bg-neutral-200` buttons, bordered inputs). Reanimated 4.5.5 is installed. `app.json` has `scheme: "stylify"` and `userInterfaceStyle: "automatic"`, but the screens are light-only. |
| Classifier | Shipped and working (Plan B done). Open: the Release-build smoke test on the phone and photos of the weak labels (`docs/mobile.md`, Known limits). The phone build installed on 2026-10-22 expires around 2026-10-29. |

What the web looks like now, logged out on an iPhone-sized viewport (Playwright, WebKit): a dark navy header with the logo and a hamburger, then a bare line "You have to login.Login" on black, with no spacing between the two sentences. The logged-in screens were not captured this session. That is the first thing to do (see "Seeing the screens").

## The goal

Minh wants both frontends to look like a carefully made product, since this is a portfolio project. Points to settle in brainstorming, not assumptions:

- One visual identity across web and iPhone (palette, type scale, radius, spacing, the hanger icon), or each following its platform's conventions with shared colours only.
- Light and dark: the web already has `next-themes` and `dark:` classes; the iPhone app declares `automatic` but has no dark styles.
- The logged-out web page (today a single line) is the first thing a visitor sees; the roadmap's spec 3 (landing page and read-only demo) overlaps with it. Decide whether this work includes it.
- Empty, loading and error states (skeletons exist on the web; the iPhone wardrobe has `ErrorState`), the item grid and item cards, forms, the classifier chips, motion.
- Fonts: loading a custom font is a new dependency on both sides (`expo-font` is already installed on mobile).

## Constraints that still apply

- **Pushing `frontend/` changes to `main` deploys the live site.** Work on a branch, and ask Minh before pushing. Smoke-test after deploy (`AGENTS.md`).
- **Typecheck the web yourself:** `(cd frontend && bun run typecheck)`; `vite build` does not.
- **React stays pinned at 19.2.0** (Expo SDK 55). No new UI library that brings its own React.
- **Xcode 26.3 / Expo SDK 55 / macOS Sequoia.** Any native dependency must support SDK 55; after one, `bunx expo prebuild -p ios --clean`, then reset signing in Xcode and trust the developer again on the phone (`docs/mobile.md`).
- **`react-native-worklets` 0.10.4 and Reanimated 4.5.5 are ahead of SDK 55 on purpose.** Never run `expo install --fix` on them.
- Exact versions for new mobile dependencies; run `bun install` at the root and commit `bun.lockb` after any `package.json` change.
- No raw `fetch` to `/api` on the web (Hono RPC), and no optimistic cache updates (`AGENTS.md` patterns). Polish should not change data flow.

## Seeing the screens (checked on 2026-10-22)

The design work should be driven by screenshots: capture every screen before, change it, capture again, and look at the images (the Read tool shows PNGs). Keep screenshots in the session scratchpad or `~/stylify-data/`, not in the repo, unless Minh wants some in `docs/` for the portfolio.

### Web: Playwright (works)

- Playwright 1.64.1 ran from a scratch folder (`npm i playwright@latest` in a temp dir with `{"type":"module"}`) after `npx playwright install webkit chromium`, which downloaded the matching browsers into `~/Library/Caches/ms-playwright/`. The older cached builds (webkit-2336, chromium-1234) do not match 1.58 or 1.64. Do not add Playwright to the repo's `package.json` without asking (the root and `frontend/` manifests deploy).
- Verified script shape: `webkit.launch()` with `devices['iPhone 15 Pro']` for the phone view and `chromium` at 1440×900 for desktop, `page.goto(url, { waitUntil: 'networkidle' })`, `page.screenshot({ fullPage: true })`. Both worked against https://stylify.space.
- **Logged-in screens need a session.** Kinde login is a real redirect flow, so Claude cannot sign in alone. Ask Minh to sign in once in a headed browser that saves cookies, then reuse them: `npx playwright codegen --save-storage=<scratchpad>/auth.json http://localhost:5173`, sign in, close; then `browser.newContext({ storageState: 'auth.json' })`. The file holds session cookies: keep it out of the repo and delete it at the end.
- Run against local dev: `bun run dev` (API on :8080) and `bun run dev:frontend` (Vite on :5173). The local `.env` has `FRONTEND_URL` so the callback returns to Vite. **Check which database `DATABASE_URL` points at before creating test items** (do not print it); if it is the production Neon database, create clearly named test items and delete them afterwards.
- Alternative: the Claude in Chrome tools (`mcp__claude-in-chrome__*`) act in Minh's own Chrome with Minh's sign-ins, so they can screenshot the logged-in live site without a saved session. Load them with the `anthropic-skills:chrome-browser` skill first.

### iPhone: simulator screenshots (works), taps (needs a tool)

- `xcrun simctl io booted screenshot <path>.png` captured the running app on the iPhone 17 simulator (iOS 26.3), at 1206×2622. This is the main check for the app.
- Useful extras: `xcrun simctl ui booted appearance dark` (or `light`) to check both themes; `xcrun simctl status_bar booted override --time 9:41 --batteryState charged --batteryLevel 100` for clean screenshots; `xcrun simctl openurl booted stylify://<route>` to open an Expo Router route by deep link (scheme `stylify`; routes like `item/<id>`, check which ones resolve) without tapping.
- Debug builds show a yellow "Open debugger to view warnings" toast at the bottom that covers content in screenshots. Dismiss it, or find and fix the warning it reports.
- **Tapping and typing:** nothing is installed for this. Maestro supports iOS 26 simulators from CLI 2.4.0 (`--device-os=iOS-26`); Java 25 is installed (`/usr/bin/java`). Installing it (`curl -Ls "https://get.maestro.mobile.dev" | bash`) is Minh's call. With it, flows (YAML: `launchApp`, `tapOn`, `inputText`, `takeScreenshot`) can walk sign-in-free paths, since the simulator keeps the Kinde session between launches once Minh has signed in. Check that it works with Xcode 26.3 before relying on it. Without it, Minh taps and Claude screenshots.
- Simulator photos: drag image files from Finder onto the simulator window to add them to Photos for the add-item flow.
- The physical iPhone cannot be screenshotted from the Mac by these tools; use the simulator for the loop and the phone for a final look.

## Suggested shape for the work

1. Brainstorm the design direction with Minh (Minh may share references). Capture the current state of every screen on both platforms first so the conversation starts from images.
2. Spec: design tokens (colour, type, spacing, radius, shadows, motion) and how each platform consumes them (Tailwind theme on the web, NativeWind theme on mobile), then screen by screen.
3. Plan with a screenshot check in every UI task: the implementer captures after-screenshots, and the reviewer reads them as well as the diff.
4. Web work deploys; group it so the live site never sits half-restyled, and ask before each push.

## Working rules that are easy to forget

- Ask before pushing to `main`. The auto-mode permission check blocks Claude's pushes to `main`; Minh runs `! git push origin main` himself.
- `expo run:ios --device` needs the phone's hardware UDID from `xcrun xctrace list devices` (the owner's iPhone 13 Pro is `00008110-0014453E0EDB801E`), not the `devicectl` identifier.
- Console.app shows the app's `console.log` lines only with Action → Include Info Messages.
- Never print or commit `.env` values. Datasets and personal photos stay out of the repo.
