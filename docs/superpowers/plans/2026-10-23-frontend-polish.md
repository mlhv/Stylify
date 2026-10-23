# Frontend Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the web app and the iPhone app one warm, chunky, friendly look (cream, coral, Nunito, a colour per clothing type, pressable bottom edges, playful copy and motion), add a logged-out landing page with an animated walkthrough, and remove the stub pages.

**Architecture:** Brand tokens (colours, per-type colours) and the type-mapping logic live once in `@stylify/shared` under a `brand` subpath, as JSON plus small pure functions, so both Tailwind configs and both apps read the same values. Each platform gets a small set of hand-built primitives (button, pill, type chip, item tile, field, garment illustration, logo) and every screen is rebuilt from them. Data flow, API calls and cache updates stay exactly as they are; only the UI around them changes.

**Tech Stack:** React 19.2.0, Vite 5, Tailwind 3, framer-motion 11, TanStack Router/Query/Form (web); Expo SDK 55, Expo Router, NativeWind 4.2.7, Reanimated 4.5.5, expo-image, expo-font (iPhone); Bun 1.3.13 tests.

**Spec:** `docs/superpowers/specs/2026-10-23-frontend-polish-design.md`. The approved mockup is `.superpowers/brainstorm/61907-1792776491/content/mix-v1.html` (open it in a browser; it is the visual reference for every screen).

## Global Constraints

- Colours: cream `#fff7ef`, ink `#2b1d14`, muted `#a08672`, line `#f0dfd0`, coral `#ff6b4a`, coral-dark `#d94c2f`, sun `#ffd36b`, white `#ffffff`.
- Font: Nunito, weights 700, 800, 900 only. Headings 900 with slight negative tracking.
- Pressable things (buttons, pills, chips, the + button) have a solid 4–5 px darker bottom edge and sink by that edge when pressed (~80 ms). Tiles have a 5 px `rgba(0,0,0,.08)` bottom edge. No drop shadows except floating toasts.
- Radii: tiles ~20 px, buttons and pills 14–16 px, inputs 14 px.
- Copy is warm, short, second person; buttons say what they do. No emoji as icons. lucide-react (web) and Ionicons (iPhone) at heavier stroke.
- Navigation names: **Closet**, **+** (Add), **Me** (Profile), on both platforms.
- Light only. No `dark:` classes, no `next-themes`; iPhone `userInterfaceStyle: "light"`.
- Respect reduced motion on both platforms (no bounce or float; fades only).
- No API, schema, cache-pattern or data-flow changes. Hono RPC only on the web (the existing S3 `PUT` to the presigned URL is not `/api` and stays).
- React stays 19.2.0. No component kit that brings its own React. Exact versions for new mobile dependencies. After any `package.json` change: `bun install` at the root and commit `bun.lockb`.
- No new native iPhone modules in this plan (so no prebuild or re-signing). Haptics (`expo-haptics`) is deliberately left for later.
- Never run `expo install --fix`. Never print `.env` values.
- Work on branch `frontend-polish`. Do not push. Minh pushes to `main` himself after approving the final task; the whole web restyle ships in that one deploy.
- Screenshots go in the session scratchpad, never the repo.

## Review Focus

1. **Item with no usable photo** (empty `imageUrl`, or the image fails to load): the tile shows the type's garment illustration on the type colour, never a broken-image icon or a grey hole.
2. **Free-text types nobody mapped** ("Scarf", "  JEANS ", "T-Shirt"): synonyms and case/whitespace map to the right label; anything else is "Other" in neutral warm grey, and still filterable.
3. **The filtered type disappears** (last "Shoes" item deleted, or edited to another type, while the Shoes pill is selected): the filter falls back to All instead of leaving an empty grid with no selected pill.
4. **Long text**: a 60-character name or type truncates to one line in tiles and chips and never widens the grid or pushes the tab bar.
5. **Reduced motion on** (macOS/iOS setting): no chip bounce, no floating hanger, no looping walkthrough motion beyond a cross-fade; everything still readable.

Items 2 and 3 are pinned by tests in Task 1. Items 1, 4 and 5 are screenshot checks in the tasks that own the tiles, chips and motion (Tasks 4, 5, 8, 9, 10), each with a named step.

---

### Task 1: Shared brand tokens and type mapping

**Files:**
- Create: `shared/src/brand/tokens.json`
- Create: `shared/src/brand/index.ts`
- Create: `shared/src/brand/index.test.ts`
- Modify: `shared/package.json` (add `"./brand": "./src/brand/index.ts"` to `exports`)
- Modify: `AGENTS.md` (add `bun test ./shared` to Commands)

**Interfaces:**
- Produces (from `@stylify/shared/brand`):
  - `TYPE_LABELS: readonly ['top','outerwear','trousers','shorts','skirt','dress','shoes','hat','bag']` and `type TypeLabel = typeof TYPE_LABELS[number]`
  - `type TypeKey = TypeLabel | 'other'`
  - `colors: { cream, ink, muted, line, coral, coralDark, sun, white, danger, dangerDark: string }`
  - `typeColors: Record<TypeKey, { bg: string; fg: string }>`
  - `TYPE_NAMES: Record<TypeKey, string>` (display names: 'Top', 'Outerwear', … 'Bag', 'Other')
  - `typeKey(type: string | null | undefined): TypeKey`
  - `groupByType<T extends { type: string | null }>(items: T[]): { key: TypeKey; count: number }[]` — only keys present, in `TYPE_LABELS` order then `'other'`
  - `type Filter = 'all' | TypeKey`
  - `resolveFilter(filter: Filter, groups: { key: TypeKey }[]): Filter` — returns `'all'` when `filter` is not among `groups`
  - `filterItems<T extends { type: string | null }>(items: T[], filter: Filter): T[]`
- Tailwind configs `require('../shared/src/brand/tokens.json')` directly (Tasks 3 and 7), so `tokens.json` holds `{ "colors": {...}, "typeColors": {...} }` with exactly the values below, and `index.ts` re-exports them typed.

Values (`colors`): the Global Constraints colours plus `danger #e5484d`, `dangerDark #b8383c`.
Values (`typeColors`, bg/fg): top `#d8ecff/#3d8bd9`, outerwear `#dff5dc/#4fae4a`, trousers `#eadcff/#9a6ae0`, shorts `#d4f3f0/#2a9d8f`, skirt `#ffe0ef/#d6528f`, dress `#ffe6cc/#d9822b`, shoes `#ece3da/#8a6a4f`, hat `#fff0bf/#d9a400`, bag `#eef3d2/#7f9628`, other `#efe7df/#a08672`.

Synonyms (`typeKey` lowercases and trims, then exact match on the label, its plural, or one of these): top ← t-shirt, tshirt, tee, shirt, blouse, sweater, jumper, polo, tank top; outerwear ← jacket, coat, hoodie, parka, blazer, cardigan, fleece; trousers ← pants, jeans, chinos, joggers, leggings; shoes ← shoe, sneakers, trainers, boots, sandals, heels; hat ← beanie, cap; bag ← backpack, tote, handbag. Plurals of each synonym also match (append "s" or "es" when the word doesn't already end in "s").

- [ ] **Step 1: Write the failing tests** in `shared/src/brand/index.test.ts` (Bun test):

```ts
import { describe, expect, test } from 'bun:test'
import { typeKey, groupByType, resolveFilter, filterItems, typeColors, TYPE_LABELS } from './index'

describe('typeKey', () => {
  test('labels, case and whitespace', () => {
    expect(typeKey('Outerwear')).toBe('outerwear')
    expect(typeKey('  JEANS ')).toBe('trousers')
    expect(typeKey('T-Shirt')).toBe('top')
    expect(typeKey('beanie')).toBe('hat')
    expect(typeKey('Hoodies')).toBe('outerwear')
    expect(typeKey('Boots')).toBe('shoes')
  })
  test('unknown, empty and null are other', () => {
    expect(typeKey('Scarf')).toBe('other')
    expect(typeKey('')).toBe('other')
    expect(typeKey(null)).toBe('other')
  })
})

test('every key has a colour pair', () => {
  for (const k of [...TYPE_LABELS, 'other'] as const) expect(typeColors[k].bg).toMatch(/^#[0-9a-f]{6}$/)
})

test('groupByType counts in label order, other last, only present keys', () => {
  const items = [{ type: 'Scarf' }, { type: 'jeans' }, { type: 'Top' }, { type: 'Trousers' }]
  expect(groupByType(items)).toEqual([
    { key: 'top', count: 1 }, { key: 'trousers', count: 2 }, { key: 'other', count: 1 },
  ])
})

test('resolveFilter falls back to all when the filtered type is gone', () => {
  expect(resolveFilter('shoes', [{ key: 'top' }])).toBe('all')
  expect(resolveFilter('top', [{ key: 'top' }])).toBe('top')
  expect(resolveFilter('all', [])).toBe('all')
})

test('filterItems', () => {
  const items = [{ type: 'jeans' }, { type: 'Top' }, { type: 'Scarf' }]
  expect(filterItems(items, 'all')).toHaveLength(3)
  expect(filterItems(items, 'trousers')).toEqual([{ type: 'jeans' }])
  expect(filterItems(items, 'other')).toEqual([{ type: 'Scarf' }])
})
```

- [ ] **Step 2: Run to verify they fail.** `bun test ./shared` → FAIL (module not found).
- [ ] **Step 3: Write `tokens.json` and `index.ts`** with the interfaces and values above. Plain constants and pure functions only (no imports beyond `./tokens.json`), so nothing new reaches the server bundle.
- [ ] **Step 4: Run.** `bun test ./shared` → PASS. `(cd server && bunx tsc --noEmit)` → no errors.
- [ ] **Step 5: Add `bun test ./shared` to the Commands block in `AGENTS.md`** (comment: `# shared brand tokens and type mapping`).
- [ ] **Step 6: Commit.** `git add shared AGENTS.md && git commit -m "feat(shared): brand tokens and clothing type mapping"`

---

### Task 2: Garment illustrations and the hanger logo

**Files:**
- Create: `shared/src/brand/garments.ts`
- Create: `frontend/src/components/brand/Garment.tsx`
- Create: `frontend/src/components/brand/Logo.tsx`
- Create: `frontend/public/favicon.svg`; delete `frontend/public/vite.svg`
- Create: `mobile/assets/illustrations/<key>.png` for each of `top, outerwear, trousers, shorts, skirt, dress, shoes, hat, bag, other, hanger` (white silhouettes on transparent, 384×384)

**Interfaces:**
- Produces: `GARMENT_PATHS: Record<TypeKey | 'hanger', string[]>` (SVG `d` strings, `viewBox="0 0 64 64"`, single colour) from `@stylify/shared/brand` (export it from `brand/index.ts`).
- Produces (web): `<Garment kind={TypeKey | 'hanger'} className?: string />` renders the paths with `fill="currentColor"`; `<Logo className?: string />` is the hanger in coral plus the word "Stylify" in Nunito 900 ink.
- Produces (iPhone): the PNGs, consumed by Task 7's `Garment` component through `expo-image` `tintColor`.

- [ ] **Step 1: Draw the garments.** Start from the mockup's `tee`, `hoodie`, `trousers`, `beanie` and `hanger` symbols (in `mix-v1.html`) and add `shorts`, `skirt`, `dress`, `shoes`, `bag`, and `other` (a folded garment or tag) in the same flat, chunky, single-colour style. `hoodie` is the `outerwear` drawing, `tee` is `top`, `beanie` is `hat`.
- [ ] **Step 2: Render the PNGs.** From the scratchpad's Playwright folder (not the repo), render each path set as white on transparent at 384×384 (`page.setContent` with an inline `<svg>`, `omitBackground: true`), write to `mobile/assets/illustrations/`. Check one with the Read tool.
- [ ] **Step 3: Write `Garment.tsx`, `Logo.tsx`, `favicon.svg`** (hanger in coral on transparent). In `frontend/index.html` set `<title>Stylify</title>`, point the icon at `/favicon.svg`, and remove `class="dark"` from `<html>`.
- [ ] **Step 4: Verify.** `(cd frontend && bun run typecheck)` → passes. `bun test ./shared` → passes.
- [ ] **Step 5: Commit.** `git commit -m "feat: garment illustrations and hanger logo"` (stage the files above).

---

### Task 3: Web foundation: theme, font, primitives, header, removed pages

**Files:**
- Modify: `frontend/tailwind.config.js`, `frontend/src/index.css`, `frontend/src/main.tsx`, `frontend/package.json`, `frontend/tsconfig.app.json` (add `"resolveJsonModule": true`)
- Modify: `frontend/src/routes/__root.tsx` (drop `NavBar`, the `<hr />`, `MountainIcon`, `MenuIcon`; keep `Outlet` and `Toaster`)
- Modify: `frontend/src/routes/_authenticated.tsx` (signed in: `<AppHeader />` + `<Outlet />`; signed out: leave the existing `Login` for now, Task 4 replaces it)
- Create: `frontend/src/components/app/AppHeader.tsx`
- Create: `frontend/src/components/app/ChunkyButton.tsx`, `Pill.tsx`, `TypeChip.tsx`, `Field.tsx`
- Delete: `frontend/src/routes/about.tsx`, `frontend/src/routes/_authenticated/outfit-suggestions.tsx`; regenerate `frontend/src/routeTree.gen.ts` (the router plugin rewrites it on `bun run build`)
- Delete if unused afterwards: `frontend/src/components/ui/sheet.tsx`, `card.tsx`, `badge.tsx`; remove `next-themes` from `frontend/package.json` if nothing imports it

**Interfaces:**
- Consumes: `colors`, `typeColors` (via Tailwind), `TypeKey`, `TYPE_NAMES` from Task 1; `Logo` from Task 2.
- Produces (Tailwind names, used by every later web task): colours `cream, ink, muted, line, coral, coral-dark, sun, danger, danger-dark`, and `type-<key>` / `type-<key>-fg` for each `TypeKey`; `font-sans` = Nunito.
- Produces components:
  - `ChunkyButton({ variant?: 'primary' | 'secondary' | 'danger' | 'quiet', size?: 'md' | 'lg', ...ButtonHTMLAttributes })` — coral with `coral-dark` 5 px bottom edge; secondary white with `line` edge; danger uses `danger`/`danger-dark`; quiet is text-only. `active:` translates down by the edge and removes it. Disabled: 50% opacity, no press.
  - `Pill({ selected: boolean, onClick, children })` — filter pill (white with `line` 4 px edge; selected ink with black edge).
  - `TypeChip({ type: TypeKey, selected: boolean, onClick, children, index?: number })` — chip in the type's colours (`bg` fill, `fg` text and edge when selected; white with `line` edge when not), with a framer-motion pop-in delayed by `index * 0.06s` (initial scale 0.4, spring with slight overshoot); no pop when `useReducedMotion()`.
  - `Field({ label: string, error?: string, ...InputHTMLAttributes })` — label (no colon) above a 14 px-radius white input with a 2 px `line` border, coral focus ring, error text below in `danger`.
  - `AppHeader()` — `Logo` left; links **Closet** (`/`), **Add** (`/create-item`, as a coral `ChunkyButton` with a plus icon), **Me** (`/profile`). At phone width, the same three in a compact row (no sheet menu). Active link in coral.

- [ ] **Step 1: Install the font.** `(cd frontend && bun add @fontsource/nunito@5.3.0)`, then `bun install` at the root. Import `@fontsource/nunito/700.css`, `800.css`, `900.css` in `main.tsx`.
- [ ] **Step 2: Theme.** In `tailwind.config.js`, `require('../shared/src/brand/tokens.json')` and map it into `theme.extend.colors` with the names above; set `fontFamily.sans` to `['Nunito', ...defaultTheme.fontFamily.sans]`; drop `darkMode`. In `index.css`, replace both shadcn variable blocks with one light block (background cream, foreground ink, border line, primary coral, destructive danger, `--radius: 1rem`), and give `body` `bg-cream text-ink font-sans font-bold antialiased`.
- [ ] **Step 3: Write the primitives and `AppHeader`** to the interfaces above, and wire `_authenticated.tsx` and `__root.tsx` as listed. Remove `dark:` classes anywhere they remain (`grep -rn "dark:" frontend/src` → nothing).
- [ ] **Step 4: Delete the About and Outfit Suggestions routes.** Run `(cd frontend && bun run build)` so `routeTree.gen.ts` regenerates without them; `grep -n "about\|outfit" frontend/src/routeTree.gen.ts` → nothing.
- [ ] **Step 5: Typecheck and test.** `(cd frontend && bun run typecheck)` → passes. `bun test ./frontend` → passes.
- [ ] **Step 6: Screenshot.** Run `bun run dev` and `bun run dev:frontend`. Before creating any test item, check which database `DATABASE_URL` points at without printing it (`grep -c neon .env` or similar); if it is the production Neon database, any items you create must be named `TEST …` and deleted at the end. Ask Minh to sign in once in Chrome at `http://localhost:5173`, then capture `/`, `/create-item`, `/profile` at 1440×900 and at 390 px wide with the Claude in Chrome tools. Pages will still look half-old; check that the header, font and cream background are right and nothing is unreadable.
- [ ] **Step 7: Commit.** `git commit -m "feat(web): warm theme, Nunito, primitives and header; remove About and Outfit Suggestions"` (include `bun.lockb`).

---

### Task 4: Web landing page with animated walkthrough

**Files:**
- Create: `frontend/src/components/landing/Landing.tsx`
- Create: `frontend/src/components/landing/Walkthrough.tsx`
- Modify: `frontend/src/routes/_authenticated.tsx` (signed out: render `<Landing />` instead of `Login`; delete `Login`)

**Interfaces:**
- Consumes: `Logo`, `Garment` (Task 2); `ChunkyButton`, `TypeChip` (Task 3); `typeColors`.
- Produces: `<Landing />` (no props), `<Walkthrough />` (no props).

Content:
- Header: `Logo`, and a quiet "Sign in" link to `/api/login`.
- Hero headline: "Know *everything* in your closet." with "everything" on a `sun` highlight. Lede: "Wardrobe apps are a chore, so nobody keeps one up. Stylify takes one photo and does the rest." Primary `ChunkyButton` "Get started" → `/api/register` (a plain `<a href>`, since it is a server redirect, not an RPC call). Secondary quiet link "I already have an account" → `/api/login`.
- Three feature cards (white, 20 px radius, tile bottom edge), each with a garment in its type colour: **Snap it** — "One photo per piece. That's the whole job." / **It knows what it is** — "On iPhone, a model running on your phone fills in the type for you." / **See it all** — "Your whole closet at a glance, on the web and on your phone."
- Footer: "Made by Minh Le" and a GitHub link to `https://github.com/mlhv/Stylify`.
- Layout: hero text left and walkthrough right at ≥1024 px; stacked (text, then walkthrough, then features) below. No horizontal scroll at 375 px.

`Walkthrough`: a phone frame (dark bezel, 40 px radius) holding a mini app screen built from the real primitives, looping through four scenes with framer-motion, ~2.5 s each:
1. "New piece": an empty photo tile with a camera icon and a pulsing coral "Take photo" button.
2. The photo tile fills (outerwear garment on its colour), the line "Hmm, let me look…".
3. "Ooh, that looks like Outerwear!" and three `TypeChip`s pop in (Outerwear selected, Top, Trousers).
4. The closet grid (4 tiles) with the new hoodie tile dropping in first with a small overshoot, and the heading "Your closet".
With `useReducedMotion()`, scenes cross-fade only, with no pops or drops. Pause the loop when the tab is hidden (`document.visibilityState`).

- [ ] **Step 1: Build `Landing` and `Walkthrough`** to the content above and wire them into `_authenticated.tsx`.
- [ ] **Step 2: Typecheck.** `(cd frontend && bun run typecheck)` → passes.
- [ ] **Step 3: Screenshot logged out** with Playwright from the scratchpad against `http://localhost:5173/` (a fresh context has no session): WebKit `devices['iPhone 15 Pro']` full page, and Chromium 1440×900. Capture each walkthrough scene (wait 0, 2.6, 5.2, 7.8 s). Read every image; compare against `mix-v1.html` for colour, type and edges.
- [ ] **Step 4: Reduced-motion check.** Repeat one Chromium capture with `reducedMotion: 'reduce'` on the context and confirm the scenes still change and nothing bounces (two captures 300 ms apart mid-transition show only opacity change).
- [ ] **Step 5: Check the links.** In the logged-out page, `a[href="/api/register"]` and `a[href="/api/login"]` both exist (Playwright `locator(...).count()` → 1 each or more).
- [ ] **Step 6: Commit.** `git commit -m "feat(web): landing page with animated walkthrough"`

---

### Task 5: Web closet page

**Files:**
- Modify: `frontend/src/routes/_authenticated/index.tsx` (rewrite the view; keep the queries)
- Create: `frontend/src/components/app/ItemTile.tsx`
- Create: `frontend/src/components/app/EmptyCloset.tsx`
- Create: `frontend/src/components/app/ErrorPanel.tsx`

**Interfaces:**
- Consumes: `typeKey`, `groupByType`, `resolveFilter`, `filterItems`, `Filter`, `TYPE_NAMES`, `typeColors` (Task 1); `Garment` (Task 2); `Pill`, `ChunkyButton` (Task 3); `getAllItemsQueryOptions`, `loadingCreateItemQueryOptions`, `getTotalClothesQueryOptions`, `Item` from `@/lib/api`.
- Produces: `<ItemTile item={Item} index={number} />` (a `Link` to `/edit-item/$id`); `<ItemTileSkeleton />`; `<EmptyCloset />`; `<ErrorPanel title: string, message: string, actionLabel?: string, onAction: () => void />` (default action label "Try again"; reused by Tasks 6 and 7).

Behaviour:
- Heading "Your *closet*" (sun highlight on "closet"), count line: "{n} pieces, nicely sorted." (`1 piece` for one; while the count loads, nothing).
- Filter row: `Pill` "All" then one per `groupByType(items)` entry, labelled `TYPE_NAMES[key]`. Keep the selected filter in component state and always render with `resolveFilter(selected, groups)`.
- Grid: 2 columns under 640 px, 3 at `sm`, 4 at `lg`, 5 at `xl`. `ItemTile`: square tile on `typeColors[key].bg` with the photo `object-cover` inside (tile radius, 5 px bottom edge), then name (one line, truncated) and "Type · Size · Colour" (one line, truncated, `muted`). If `imageUrl` is empty or the image errors (`onError`), show `<Garment kind={key}>` in `typeColors[key].fg` instead. Hover: lift 2 px. Tiles enter with a staggered fade-and-rise (`index * 0.04s`, capped at 0.4 s); none when reduced motion.
- The whole tile opens Edit. Remove the click-to-reveal panel and the inline delete button (delete moves to Edit in Task 6).
- While `loadingCreateItem` holds an item, show one `ItemTileSkeleton` first (a pulsing tile in `line`).
- Pending: 8 skeleton tiles. Error: `ErrorPanel` "Couldn't load your closet" with the error message and "Try again" (`refetch`). Empty: `EmptyCloset` — floating hanger on a `#ffe1d6` circle, "It's a bit empty in here", "Snap your first piece and we'll keep track of it for you.", `ChunkyButton` "Add your first piece" → `/create-item`. Float animation off under reduced motion.

- [ ] **Step 1: Build the components and the page** as above.
- [ ] **Step 2: Typecheck.** `(cd frontend && bun run typecheck)` → passes.
- [ ] **Step 3: Screenshot** `/` signed in at 1440×900 and 390 px with Claude in Chrome. Read them.
- [ ] **Step 4: Review Focus checks.** In the local database (see Task 3 Step 6 on test-item naming), create `TEST a very long name that keeps going and going past sixty chars` with type `Scarf` (the old form still works at this point). Confirm the tile truncates and the Other pill filters it. Break one tile's image (DevTools: set its `src` to `https://invalid.example/x.jpg`) and confirm the garment placeholder shows. Screenshot each. Keep the test item for Task 6.
- [ ] **Step 5: Empty and error states.** Empty: render `<EmptyCloset />` in place of the grid in a throwaway local edit, screenshot, and revert (`git diff` must show no trace). Error: stop the API (`bun run dev`), reload, screenshot, restart it.
- [ ] **Step 6: Commit.** `git commit -m "feat(web): closet grid with type colours, filters and empty state"`

---

### Task 6: Web Add and Edit form

**Files:**
- Create: `frontend/src/components/app/ItemForm.tsx`
- Create: `frontend/src/components/app/PhotoPicker.tsx`
- Modify: `frontend/src/routes/_authenticated/create-item.tsx` (keep `onSubmit`'s upload, cache and toast logic verbatim; replace the JSX with `ItemForm`)
- Modify: `frontend/src/routes/_authenticated/edit-item.$id.tsx` (same; add Delete)

**Interfaces:**
- Consumes: `Field`, `TypeChip`, `ChunkyButton` (Task 3); `ErrorPanel` (Task 5); `TYPE_LABELS`, `TYPE_NAMES`, `typeKey` (Task 1); `deleteItem`, `getAllItemsQueryOptions`, `getTotalClothesQueryOptions` from `@/lib/api`.
- Produces:
  - `ItemForm({ title: string, defaultValues: createItem, currentImageUrl?: string, requirePhoto: boolean, submitLabel: string, onSubmit: (value: createItem, image: File | undefined) => Promise<void>, footer?: ReactNode })` — owns `useForm` (zod adapter, `createItemSchema` field validators) and the chosen `File`; renders the photo picker, the four fields, the nine type chips and the submit button. Each route moves its existing `onSubmit` body, unchanged, into the function it passes, reading the image from the second argument. Edit renders `ItemForm` only once the item has loaded, with the item as `defaultValues`, which replaces the `setFieldValue` effect.
  - `PhotoPicker({ previewUrl?: string, onChange: (file: File | undefined) => void })` — a large square tile (20 px radius, `line` dashed border when empty, camera icon, "Add a photo — click or drop it here"); when there is a preview, the photo fills it with a white "Change photo" `ChunkyButton` (secondary) on top. Accepts click (hidden `<input type="file" accept="image/*">`) and drag-and-drop. Revokes object URLs it creates.

Behaviour:
- Titles: Add "New piece", Edit "Edit piece". Labels: Name, Type, Size, Colour (no colons). Placeholders: "Zip hoodie", "Pick one below or type your own", "Like M or 32", "Like black".
- Under Type, the nine `TypeChip`s (`TYPE_NAMES` for the nine labels, not Other) in their colours; clicking one sets the Type field to the name and validates it (`form.setFieldValue` then `form.validateField('type', 'change')`). The chip whose key equals `typeKey(current type)` shows selected.
- Add requires a photo: if none, submit shows "Add a photo first" under the picker and does not call `onSubmit`. Edit keeps the current photo when none is chosen.
- Submit: coral `ChunkyButton` "Add to closet" / "Save changes", disabled while `!canSubmit`. Reset is removed.
- Edit footer: secondary danger `ChunkyButton` "Delete piece". First click turns it into an inline confirmation row: "Delete this piece? This can't be undone." with danger "Delete" and quiet "Keep it". Delete calls `deleteItem`, then updates the list and total caches exactly as today's `ItemDeleteButton.onSuccess` does (move that logic here), toasts "Deleted {name}", and navigates to `/`. No `window.confirm`.
- Edit states: loading → a skeleton of the form; gone → `ErrorPanel` "This piece is gone" / "It may have been deleted on another device." / "Back to closet"; error → `ErrorPanel` "Couldn't load this piece" with retry.
- Toast copy: "Added {name} to your closet", "Saved {name}", errors "Couldn't add that piece. Try again?" / "Couldn't save that piece. Try again?". Style the `sonner` toaster to the theme (white, 16 px radius, ink text, Nunito).

- [ ] **Step 1: Build `PhotoPicker` and `ItemForm`; switch both routes to them.**
- [ ] **Step 2: Typecheck.** `(cd frontend && bun run typecheck)` → passes.
- [ ] **Step 3: Run the flows** in Chrome on local dev: add a `TEST hoodie` with a photo (any image from `~/stylify-data/`), check it lands in the closet with the right colour; edit it (change type with a chip, change the photo); delete it through the confirmation. Screenshot Add empty, Add filled, Edit, the delete confirmation, and the Add-without-photo error.
- [ ] **Step 4: Long text and the vanishing filter.** Open the `TEST` Scarf item from Task 5: no chip is selected and the 60-character name holds the layout at 390 px. Back in the closet, select the Other pill, open the item, delete it, and confirm the closet shows All. Screenshot each. Delete any remaining test items.
- [ ] **Step 5: Commit.** `git commit -m "feat(web): shared item form with photo picker, type chips and delete"`

---

### Task 7: Web Me page

**Files:**
- Modify: `frontend/src/routes/_authenticated/profile.tsx`
- Delete if unused: `frontend/src/components/ui/avatar.tsx`

**Interfaces:**
- Consumes: `userQueryOptions`, `getAllItemsQueryOptions`; `groupByType`, `typeColors`, `TYPE_NAMES` (Task 1); `Garment` (Task 2); `ChunkyButton` (Task 3); `ErrorPanel` (Task 5).

Behaviour:
- A white card (20 px radius, tile edge): initials avatar on `sun` (Nunito 900), full name, email in `muted`.
- "Your closet in numbers": total pieces in large Nunito 900, then one small tile per `groupByType(items)` entry: garment in `fg` on `bg`, count, and `TYPE_NAMES[key]`.
- If the user has no items: "Nothing to count yet. Add your first piece!" with a link to `/create-item`.
- Sign out: quiet `ChunkyButton` "Sign out" → `/api/logout` (a plain link; it is a server redirect).
- Remove "Profile Information", the fake "Recent Wardrobe Items" list and "Edit Profile".
- Loading: skeleton card. Errors: `ErrorPanel` with retry.

- [ ] **Step 1: Rebuild the page.**
- [ ] **Step 2: Typecheck.** `(cd frontend && bun run typecheck)` → passes; `(cd frontend && bun run build)` → succeeds.
- [ ] **Step 3: Screenshot** `/profile` at both widths. Read them.
- [ ] **Step 4: Commit.** `git commit -m "feat(web): Me page with real closet counts"`

---

### Task 8: iPhone foundation: font, theme, primitives, tab bar, sign-in

**Files:**
- Modify: `mobile/package.json` (add `"@expo-google-fonts/nunito": "0.4.2"`), then `bun install` at the root
- Modify: `mobile/app.json` (`userInterfaceStyle: "light"`; splash `backgroundColor: "#fff7ef"`)
- Modify: `mobile/tailwind.config.js` (require `../shared/src/brand/tokens.json`; same colour names as the web; `fontFamily`: `nunito` → `Nunito_700Bold`, `nunito-heavy` → `Nunito_800ExtraBold`, `nunito-black` → `Nunito_900Black`)
- Modify: `mobile/src/app/_layout.tsx` (load the three fonts with `useFonts` from `@expo-google-fonts/nunito`; keep the splash up until loaded; replace `bg-white` with `bg-cream`; style the `item/[id]` header: cream background, Nunito 900 title "Edit piece", coral back chevron)
- Modify: `mobile/src/app/(tabs)/_layout.tsx` (tabs Closet / + / Me, `headerShown: false`; custom tab bar button for `add`; remove `BackToWardrobe`)
- Modify: `mobile/src/app/sign-in.tsx`
- Create: `mobile/src/components/ui/Txt.tsx`, `ChunkyButton.tsx`, `Pill.tsx`, `TypeChip.tsx`, `Garment.tsx`, `Screen.tsx`

**Interfaces:**
- Consumes: tokens and `TypeKey`, `typeColors`, `TYPE_NAMES` from `@stylify/shared/brand` (Task 1); PNGs (Task 2).
- Produces:
  - `Txt({ weight?: 'bold' | 'heavy' | 'black', className?, ...TextProps })` — every text in the app goes through it, so Nunito is never missed. Default `bold`, colour `ink`.
  - `ChunkyButton({ label: string, onPress, variant?: 'primary' | 'secondary' | 'danger' | 'quiet', icon?: IoniconName, busy?: boolean, disabled?: boolean })` — 5 px bottom edge done as an outer `View` in the edge colour with the face translated up; on press-in the face animates down 5 px over 80 ms (Reanimated `withTiming`), back on release. `busy` shows an `ActivityIndicator` in place of the label.
  - `Pill({ label: string, selected: boolean, onPress })`
  - `TypeChip({ type: TypeKey, label: string, selected: boolean, onPress, index?: number })` — enters with Reanimated `FadeIn`/`ZoomIn.springify()` delayed `index * 60` ms; when `selected && index === 0`, a one-time bounce (`withSequence` −6 px, 0, −2 px, 0). Under `useReducedMotion()`, plain `FadeIn` and no bounce.
  - `Garment({ kind: TypeKey | 'hanger', size: number, color: string })` — `expo-image` of the PNG with `tintColor={color}`.
  - `Screen({ title: ReactNode, subtitle?: string, children })` — cream `SafeAreaView` (top edge) with the in-content heading (Nunito 900, 30 px, −0.5 tracking) used by Closet, Add and Me.
- Tab bar: cream background, 2 px `line` top border, labels Nunito 800 11 px, inactive `#b39a86`, active coral, Ionicons `shirt` / `person` (filled when active). The `add` tab renders a 54×50 coral button with a 5 px `coral-dark` bottom edge and a white `add` icon, raised 22 px above the bar, accessibility label "Add a piece".

Sign-in screen: cream; `Garment kind="hanger"` (120 px, coral) on a `#ffe1d6` circle floating gently (off under reduced motion); "Stylify" (Nunito 900, 40 px); "Know everything in your closet. One photo per piece, and we'll do the rest."; primary `ChunkyButton` "Sign in"; error text in `danger`. Keep the existing sign-in logic.

- [ ] **Step 1: Add the font dependency** (exact version above), `bun install` at the root, confirm `node_modules/@expo-google-fonts/nunito` exists and `find node_modules -path '*node_modules/react/package.json'` prints one line.
- [ ] **Step 2: Theme, fonts, primitives, tab bar, sign-in** as above.
- [ ] **Step 3: Typecheck and test.** `(cd mobile && bunx tsc --noEmit && bun test src)` → passes.
- [ ] **Step 4: Check Metro resolves the subpath export.** Start Metro (`cd mobile && bunx expo start`), reload the simulator app; if `@stylify/shared/brand` fails to resolve, enable `unstable_enablePackageExports` in `metro.config.js` (keep other config) and note it in the commit message.
- [ ] **Step 5: Screenshot** the tab bar on any tab and the sign-in screen (Minh signs out on the simulator and back in afterwards). Use `xcrun simctl status_bar booted override --time 9:41 --batteryState charged --batteryLevel 100`. Also set the simulator to dark (`xcrun simctl ui booted appearance dark`), screenshot, and confirm it still looks light; set it back.
- [ ] **Step 6: Commit.** `git commit -m "feat(mobile): Nunito, warm theme, chunky primitives, tab bar and sign-in"` (include `bun.lockb`).

---

### Task 9: iPhone closet screen

**Files:**
- Modify: `mobile/src/app/(tabs)/index.tsx`
- Create: `mobile/src/components/ItemTile.tsx`
- Create: `mobile/src/components/EmptyCloset.tsx`
- Modify: `mobile/src/components/ErrorState.tsx` (restyle; keep `errorMessage` and the props)

**Interfaces:**
- Consumes: Task 1 functions; Task 8 primitives; `getAllItemsQueryOptions`, `Item`.
- Produces: `<ItemTile item={Item} index={number} />`, `<EmptyCloset onAdd={() => void} />`; restyled `ErrorState` (same signature: `{ error, onRetry, retryLabel? }`).

Behaviour (as the mockup's Closet and Empty closet screens):
- `Screen` titled "Your *closet*" (sun highlight on "closet"), subtitle "{n} pieces, nicely sorted." (`1 piece`).
- Horizontal `ScrollView` of `Pill`s: All + `groupByType(items)`; render with `resolveFilter`.
- Two-column `FlatList` of `filterItems(items, filter)`. `ItemTile`: square on `typeColors[key].bg`, 20 px radius, 5 px tile edge, photo via `expo-image` `contentFit="cover"`; on empty `imageUrl` or `onError`, `Garment` in `fg` at 56% size. Name (`Txt heavy`, 14 px, one line) and "Type · Size · Colour" (`muted`, 12 px, one line). Press scales to 0.97. Entering: `FadeInDown.delay(min(index, 10) * 40)`; none under reduced motion.
- Pull to refresh kept. Skeletons: six pulsing tiles in `line`.
- Empty: `EmptyCloset` — floating hanger on a `#ffe1d6` circle, "It's a bit empty in here", "Snap your first piece and we'll figure out what it is for you.", primary `ChunkyButton` "Add your first piece" → `router.navigate('/add')`.
- `ErrorState`: a `Garment kind="other"` in `muted`, the message, and a primary `ChunkyButton` with `retryLabel`.

- [ ] **Step 1: Build the screen and components.**
- [ ] **Step 2: Typecheck and test.** `(cd mobile && bunx tsc --noEmit && bun test src)` → passes.
- [ ] **Step 3: Screenshot** the closet with items, a filter selected, and the empty state (a second account, or an all-`TEST` account Minh empties, or a throwaway local change reverted before commit). Screenshot the error state with the API unreachable (turn off the Mac's Wi-Fi only if Minh agrees; otherwise point `API_URL` at a closed port in a throwaway local change).
- [ ] **Step 4: Review Focus checks.** With a `TEST` item named 60 characters long, typed "Scarf", with no photo: tile truncates, shows the Other garment, and the Other pill filters it; delete it from Edit while its pill is selected and confirm the closet returns to All. Screenshots. Delete test items.
- [ ] **Step 5: Commit.** `git commit -m "feat(mobile): closet grid with type colours, filters and empty state"`

---

### Task 10: iPhone Add and Edit form

**Files:**
- Modify: `mobile/src/components/ItemForm.tsx` (look, copy and motion only; keep the keyboard handling, `useTypeSuggestion`, `decide`, and `onSubmit` contract unchanged)
- Modify: `mobile/src/app/(tabs)/add.tsx` (wrap in `Screen` titled "New piece"; `submitLabel="Add to closet"`)
- Modify: `mobile/src/app/item/[id].tsx` (`submitLabel="Save changes"`; Delete as a `ChunkyButton variant="danger"` "Delete piece"; Alert copy "Delete this piece?" / "This can't be undone." / "Keep it" / "Delete")

**Interfaces:**
- Consumes: Task 8 primitives (`ChunkyButton`, `TypeChip`, `Txt`, `Garment`); `typeKey`; existing `decide` (unchanged, still three chips).

Behaviour (as the mockup's New piece screen):
- Photo: a square tile, 22 px radius, tile edge. Empty: `line` fill with a camera Ionicon and "Add a photo of your piece". With a photo: the photo, on the colour of `typeKey(current type)`.
- "Take photo" and "Choose photo" as two secondary `ChunkyButton`s with camera / images icons.
- Classifier line under the Type field (`Txt heavy`, 15 px):
  - `pending`: "Hmm, let me look…" with three dots fading in sequence.
  - Chips shown and the field was pre-filled by this run: "Ooh, that looks like {Type}!".
  - Chips shown and no pre-fill (below threshold): "Not sure about this one. Which is it?".
- Chips: `TypeChip` for each `decide` chip, `index` = position, `type = typeKey(chip)`. Pressing keeps today's behaviour (`lastPrefill.current = null; setType(chip)`).
- Fields: white, 14 px radius, 2 px `line` border, coral border while focused, Nunito 700 16 px, placeholders as on the web (Task 6). Labels Nunito 800 13 px `muted`. Errors in `danger`.
- Submit: primary `ChunkyButton` with `busy` while submitting; form error text in `danger`.

- [ ] **Step 1: Restyle `ItemForm`, `add.tsx`, `item/[id].tsx`.**
- [ ] **Step 2: Typecheck and test.** `(cd mobile && bunx tsc --noEmit && bun test src)` → passes (the `suggestion` and `typeSuggestion` tests must pass untouched).
- [ ] **Step 3: Screenshot the flow.** Minh adds a photo on the simulator (drag an image from `~/stylify-data/` onto the simulator first). Capture: empty Add, "Hmm, let me look…", the chips just after they appear (take two screenshots ~150 ms apart to see the pop), a filled form, Edit with Delete, and the keyboard up on the Colour field (the field must stay visible).
- [ ] **Step 4: Reduced motion.** Turn it on (Simulator: Settings → Accessibility → Motion → Reduce Motion, Minh taps), repeat the chip capture, confirm no bounce. Turn it off.
- [ ] **Step 5: Commit.** `git commit -m "feat(mobile): chunky item form with animated classifier chips"`

---

### Task 11: iPhone Me screen and the debug warning

**Files:**
- Modify: `mobile/src/app/(tabs)/profile.tsx`
- Modify: whichever file causes the "Open debugger to view warnings" toast (found in Step 1)

**Interfaces:**
- Consumes: Task 1 (`groupByType`, `typeColors`, `TYPE_NAMES`), Task 8 primitives, `ErrorState`, `getAllItemsQueryOptions` (instead of `getTotalClothesQueryOptions` for the numbers).

Behaviour: `Screen` titled "Me". A white card: avatar (Kinde picture, or initials on `sun`), name, email. "Your closet in numbers": total, then a two-column grid of small per-type tiles (garment, count, name) as on the web. Empty: "Nothing to count yet. Add your first piece!". Sign out as a quiet `ChunkyButton` at the bottom, keeping the existing `signOut` logic and its error `Alert`.

- [ ] **Step 1: Find the warning.** With Metro running, open the app and read the warning text in the Metro terminal output (or press `j` to open the debugger console). Fix its cause. If it comes from a dependency and cannot be fixed here, add `LogBox.ignoreLogs([<exact message prefix>])` in `_layout.tsx` with a one-line comment naming the dependency, and note it in the commit message.
- [ ] **Step 2: Rebuild the Me screen.**
- [ ] **Step 3: Typecheck and test.** `(cd mobile && bunx tsc --noEmit && bun test src)` → passes.
- [ ] **Step 4: Screenshot** Me, and confirm no warning toast on any of the four screens.
- [ ] **Step 5: Commit.** `git commit -m "feat(mobile): Me screen with closet counts; fix startup warning"`

---

### Task 12: Docs, future work, final checks, ready to ship

**Files:**
- Modify: `docs/frontend.md` (new layout: landing, header, primitives in `components/app/`, brand components, removed routes)
- Modify: `docs/mobile.md` (theme, fonts, primitives in `components/ui/`, the illustration PNGs and how they were rendered, tab names)
- Modify: `AGENTS.md` (Key paths table: `shared/src/brand/`, `frontend/src/components/app/`, `mobile/src/components/ui/`; remove `outfit-suggestions` mentions if any)
- Modify: `docs/superpowers/specs/2026-10-05-mobile-foundation-design.md` roadmap section: mark the landing page done (walkthrough instead of demo) and add **Future work**: About page; Outfit Suggestions screen (needs `GEMINI_API_KEY` on Lambda; `/api/recommendations` is kept); haptics with `expo-haptics`; Kinde hosted sign-in branding (manual, in Kinde's dashboard: business name, logo, coral)

- [ ] **Step 1: Write the docs** above.
- [ ] **Step 2: Full verification.**
  - `bun test ./server && bun test ./shared && bun test ./frontend && bun test ./infra` → all pass
  - `(cd server && bunx tsc --noEmit)` → passes
  - `(cd frontend && bun run typecheck && bun run build)` → passes
  - `(cd mobile && bunx tsc --noEmit && bun test src)` → passes
  - `docker build -f server/Dockerfile -t stylify-check .` → builds; run it as in `docs/cloud-architecture.md` and confirm `GET /api/me` returns 401; `docker run --rm stylify-check sh -c 'ls node_modules | wc -l'` → about 57 (the `shared/` change triggers a server deploy too)
- [ ] **Step 3: Final screenshot set** of every screen on both platforms (web: landing at both widths, Closet, Add, Edit, Me; iPhone: sign-in, Closet, empty closet, Add with chips, Edit, Me), saved in the scratchpad. Show them to Minh.
- [ ] **Step 4: Commit the docs.** `git commit -m "docs: frontend polish, future work"`
- [ ] **Step 5: Stop and ask Minh** to review the screenshots and approve shipping. On approval: fast-forward `main` to `frontend-polish` locally (`git switch main && git merge --ff-only frontend-polish`), and ask Minh to run `! git push origin main`. After the deploy, run the smoke test from `AGENTS.md` (`https://stylify.space` → 200, `/api/me` → 401), then capture the live landing page with Playwright and the logged-in Closet with Claude in Chrome. Then Minh installs the iPhone build on the phone (`docs/mobile.md`) for a final look.
