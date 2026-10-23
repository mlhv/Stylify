# Frontend polish: one friendly, chunky look for web and iPhone

Date: 2026-10-23
Status: approved by Minh 2026-10-23
Supersedes: the "Web landing page and read-only demo" item (spec 2 in the list) of `2026-10-05-mobile-foundation-design.md`, for the landing page. The read-only demo there is replaced by an animated walkthrough.

## Why

Stylify is a portfolio project first. A recruiter who clicks stylify.space from Minh's CV today sees "You have to login.Login" on a black page, and the pages behind the login are a mix of half-styled shadcn defaults and stub text ("Hello from About!"). The iPhone app works but has plain, unstyled controls. Neither looks like a carefully made product.

The pitch Minh wants a visitor to get within seconds: **there is no good app for keeping track of your wardrobe, and Stylify makes it effortless.** You take one photo per item, the type is filled in for you (by the on-device classifier on the iPhone), and you see everything you own at a glance.

Stylify is a tool. Its frontend should feel like a consumer app with personality, in the spirit of **Duolingo and Beli**: colourful, friendly, with fun motion, but with taste.

## Goals

1. A logged-out landing page on the web that makes the pitch, with an animated walkthrough of the app, and sends visitors to sign in.
2. One visual identity, used by both the web app (`frontend/`) and the iPhone app (`mobile/`): the same colours, type, shapes, per-type colours, copy voice and motion vocabulary.
3. Every screen on both platforms restyled to it, including empty, loading and error states.
4. Every change checked by screenshots, before and after, on both platforms.

## Non-goals

- Dark mode. The look is light only. On the web, remove the `dark:` classes and `next-themes` usage that are not needed; on the iPhone, set `userInterfaceStyle` to `light` in `app.json` so system dark mode does not half-apply.
- A read-only demo account or seeded demo data. The animated walkthrough replaces it.
- New features or data-flow changes. No API, schema or cache-pattern changes (`AGENTS.md` patterns still hold: Hono RPC, no optimistic updates).
- Running the classifier on the web. The web gets the type chips as quick picks but no prediction.
- An App Store link. The app is not on the App Store.

## Anti-goals (failure even if it works)

- The "vibe-coded" look: stock shadcn grey cards, default Inter, purple-blue gradients, emoji standing in for icons, every corner the same radius, bouncing everything at once.
- Motion that slows down a task. Animations are short and never block input.
- Copy that is cutesy enough to get in the way. Chatty, warm, and still clear about what a button does.
- A live site that sits half-restyled between deploys.

## The visual identity (agreed with Minh in mockups)

Minh picked a mix of two mockup directions: the **warm, cream, chatty** one and the **chunky, pressable** one. The approved mockup is `.superpowers/brainstorm/61907-1792776491/content/mix-v1.html` (Closet, Add, Empty closet on an iPhone). Treat it as the reference for look and feel; the values below come from it.

### Colour

| Token | Value | Use |
|---|---|---|
| cream | `#fff7ef` | Page and screen background |
| ink | `#2b1d14` | Text, the selected filter pill |
| muted | `#a08672` | Secondary text |
| line | `#f0dfd0` | Borders, input outlines, pill edges, tab bar rule |
| coral | `#ff6b4a` | Primary action (buttons, the + button, active tab) |
| coral-dark | `#d94c2f` | The pressable bottom edge under coral |
| sun | `#ffd36b` | Highlight behind a heading word ("Your **closet**") |
| white | `#ffffff` | Cards, inputs, unselected pills |

A destructive colour for delete is left to the builder; it must sit in this palette (a warm red, not the current dark maroon).

### A colour per clothing type

Each of the classifier's nine labels (`mobile/assets/model/classifier.json`: top, outerwear, trousers, shorts, skirt, dress, shoes, hat, bag) gets a pastel background and a stronger foreground. It colours the item tile behind the photo, the type chip, and the filter pill. From the mockup: top `#d8ecff`/`#3d8bd9`, hat `#fff0bf`/`#d9a400`, outerwear `#dff5dc`/`#4fae4a`, trousers `#eadcff`/`#9a6ae0`. The other five are the builder's call, distinct from each other and from coral.

`type` is free text in the database. Map it case-insensitively to a label, with a few obvious synonyms (for example "T-shirt", "tee" → top; "beanie" → hat; "jacket", "hoodie" → outerwear; "pants", "jeans" → trousers). Anything else gets a neutral warm grey. Filter pills and the per-type counts on Me group by the mapped label, with an "Other" bucket for unmapped types (my call), so "Jeans" and "Trousers" share one pill. This mapping and the palette live in one place in `shared/` so both platforms use the same one.

### Type

**Nunito**, weights 700 to 900. Headings 900 with slight negative tracking; labels and body 700 to 800. On the web, self-host it (for example `@fontsource/nunito`) rather than calling Google Fonts at runtime. On the iPhone, load it with `expo-font` (already installed), for example via `@expo-google-fonts/nunito`, which is JavaScript only.

### Shape

- Large radii: tiles about 20 px, buttons and pills about 14 to 16 px, inputs about 14 px.
- **Pressable things have a thick bottom edge**: a solid 4 to 5 px darker edge under buttons, pills, chips and the + button, which flattens when pressed (the element moves down by the edge height). This is the Duolingo cue and the main "chunky" signal.
- Tiles have a softer 5 px bottom edge in translucent black.
- No drop shadows except on floating things (toasts).

### Copy voice

Warm, short, second person, a little playful. From the mockups: "Your closet", "24 pieces, nicely sorted.", "Ooh, that looks like Outerwear!", "It's a bit empty in here", "Snap your first piece and we'll figure out what it is for you.", "Add to closet". Buttons always say what they do.

The iPhone tabs follow the mockup: **Closet**, a raised coral **+** in the middle (Add), and **Me** (Profile). The web uses the same names.

### Motion

- Press: buttons and pills sink by their bottom edge, about 80 ms.
- Classifier chips on Add: pop in one after another (scale from about 0.4 with a small overshoot), and the top guess does a short bounce.
- Items enter the grid with a short staggered fade-and-rise; an added item lands with a small pop.
- The empty-state illustration floats gently.
- Screen transitions keep the platform's own (iOS push, web instant or a short fade).
- Respect reduced motion on both platforms: no bounce or float, just fades.

Web uses `framer-motion` (installed). iPhone uses Reanimated 4.5.5 (installed). Haptics on the iPhone (a light tap when a chip is picked, a success tap on save) would suit the Duolingo feel; it needs `expo-haptics`, a native module, so it is the builder's call under the native-dependency constraint below.

### Illustrations and icons

- A small set of flat garment illustrations in the mockup's style (solid shapes in the type's strong colour) for the landing walkthrough, empty states, and a placeholder when an item has no photo. Hand-made SVG; no stock illustration packs.
- The logo is the hanger (the iPhone app icon already uses it), replacing the web's mountain icon.
- Icons: keep `lucide-react` on the web and Ionicons on the iPhone, at heavier stroke weights so they sit with Nunito. No emoji as icons.

## Screens

### Web, logged out: landing page (`/` when signed out)

Replaces the inline "You have to login" guard in `_authenticated.tsx`.

- Header: hanger logo + "Stylify", "Sign in" link.
- Hero: a headline making the pitch (direction: "Know everything in your closet", with one word highlighted in sun), one or two lines on why (wardrobe apps are a chore, so nobody keeps one up; Stylify takes a photo and does the rest), and a coral "Get started" button that goes to `/api/register`, so any visitor can create their own account (Minh's decision: strangers may sign up and use the live site; items are per user). "Sign in" in the header goes to `/api/login`. Final wording is the builder's within the voice above.
- **Animated walkthrough** beside the hero (below it on phones), inside a phone frame, looping: a photo is taken or picked → "Ooh, that looks like Outerwear!" with chips popping in → the item drops into the closet grid. Built from the same components and illustrations as the real app (not a video or GIF), so it stays crisp and on-brand.
- Three short feature points: snap one photo; the type is filled in for you (on-device ML on the iPhone); your whole wardrobe at a glance, on web and iPhone.
- A footer with Minh's name and a GitHub link (optional, builder's call; it is a portfolio piece).
- Responsive from iPhone width to desktop.

### Web, logged in

- **Header**: hanger logo, links to Closet, Add, Me. On phones, a compact header or bottom bar instead of the current sheet menu (builder's call). Remove About and Outfit Suggestions from navigation.
- **Closet** (`/`): heading "Your closet" with the count line, filter pills by type (All plus the types present), a grid of tiles (photo on the type colour, name, "Type · Size · Colour"). Keep the current click-to-reveal Edit and Delete if it fits, or move them to the Edit page; delete still confirms. Skeleton tiles while loading, the empty state when there are no items, and a friendly error state with a retry.
- **Add** (`/create-item`) and **Edit** (`/edit-item/$id`): one shared form. A proper photo picker (a large tile showing the chosen or current photo, click or drop to change) instead of the browser's file input; Edit shows the item's current photo. The nine type labels as quick-pick chips that fill the Type field (the web has no classifier, so it shows all nine, always visible, in their type colours; the iPhone keeps its classifier-driven chips, see below). Field labels without colons. A coral primary button; Reset goes or becomes a quiet text button. Validation messages in the voice.
- **Me** (`/profile`): avatar, name, email, and real numbers from the user's own items (total, and pieces per type in the type colours) instead of the made-up "Recent Wardrobe Items" list. Remove the "Edit Profile" button (it does nothing). Sign out as a quiet button.
- Browser tab title "Stylify" and a hanger favicon instead of "Vite + React + TS".

### iPhone

- **Sign in**: cream screen, hanger illustration, the pitch in one line, a coral "Sign in" button.
- **Closet** (tab): as in the mockup. Filter pills, tiles with photos on type colours, pull to refresh kept, empty state from the mockup, `ErrorState` restyled.
- **Add** (+): as in the mockup. Photo tile, Take photo / Choose photo as chunky buttons, "Identifying…" restyled as a friendly line ("Hmm, let me look…" then "Ooh, that looks like Outerwear!"; when the classifier is unsure, a line that asks the user to pick), animated chips, fields, "Add to closet". **Chip behaviour does not change** (my call): `decide()` in `mobile/src/lib/suggestion.ts` still shows the classifier's top three guesses after a photo is classified, with the same unsure handling as today; only the look, copy and pop-in animation change. Edit runs no classification, as today.
- **Edit** (`item/[id]`): the same form, with Delete in the destructive colour and a native confirmation.
- **Me** (tab): avatar, name/email, the same per-type counts as the web, Sign out.
- Fix whatever raises the debug "Open debugger to view warnings" toast, so screenshots are clean.

## Removed now, future work

Record these in the roadmap or `docs/` as future work:

- **About** page (`/about`, "Hello from About!"): removed, with its route.
- **Outfit Suggestions** page (`/outfit-suggestions`): removed from the web, with its route. The API route `/api/recommendations` stays as it is (it needs `GEMINI_API_KEY` on Lambda to work). A real outfit-suggestions screen is future work.
- Optional, manual: Kinde's hosted sign-in page still says "virtualWardrobe" in Kinde's default style. Kinde's dashboard allows a business name, logo and brand colours; Minh can set them by hand. Not part of the code work.

## Constraints

- **Pushing `frontend/` or `shared/` to `main` deploys the live site.** Work on a branch. Group web changes so the live site moves from old look to new look in one deploy (or a small number of complete steps), never half-restyled. Ask Minh before each push; Minh runs the push. Smoke-test after deploy (`AGENTS.md`).
- Typecheck the web with `(cd frontend && bun run typecheck)`; `vite build` does not.
- React stays at 19.2.0. No UI library that brings its own React. Prefer building the small set of components (button, pill, chip, tile, input, photo picker) over adding a component kit.
- iPhone: Xcode 26.3, Expo SDK 55. Any new native module must support SDK 55 and then needs `bunx expo prebuild -p ios --clean`, re-signing in Xcode, and trusting the developer on the phone again (`docs/mobile.md`). Keep native additions to a minimum; JavaScript-only packages are preferred. Never run `expo install --fix` on worklets or Reanimated.
- Exact versions for new mobile dependencies; `bun install` at the root and commit `bun.lockb` after any `package.json` change.
- The shared tokens in `shared/` must not pull anything into the server bundle (plain constants only).
- Screenshots go in the session scratchpad or `~/stylify-data/`, not the repo, unless Minh asks for some in `docs/`.

## Verification

Every UI task ends with after-screenshots that the reviewer reads, not only the diff:

- Web: Playwright from a scratch folder (WebKit at iPhone 15 Pro size, Chromium at 1440×900) for logged-out pages; logged-in pages via Minh's Chrome (Claude in Chrome) or a saved Playwright session (`docs/superpowers/handoffs/2026-10-22-frontend-polish-handoff.md`, "Seeing the screens").
- iPhone: `xcrun simctl io booted screenshot` on the iPhone 17 simulator with a clean status bar. Minh taps where needed.
- Check reduced motion on both.
- A final look on Minh's phone.

## Left to the builder

- Component structure and file layout on both platforms; how the shared tokens reach Tailwind (web) and NativeWind (iPhone) configs.
- The other five type colours, the destructive colour, the exact spacing scale.
- Final copy, within the voice.
- The illustrations themselves, in the mockup's style.
- The web's phone-width navigation.
- Whether to add `expo-haptics` (see Constraints).
- The order of the work, provided the web deploys whole.
