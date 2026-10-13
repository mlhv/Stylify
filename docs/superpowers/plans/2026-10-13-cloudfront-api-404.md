# CloudFront: Stop Masking API 404s — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** API responses reach clients with the status the API sent, while deep links to the web app keep loading.

**Architecture:** A CloudFront Function on the S3 (default) behaviour rewrites extensionless paths to `/index.html`. With deep links served that way, the distribution-wide 403/404 → `/index.html` custom error responses are removed, so origin statuses pass through. Rolled out in two distribution updates so deep links work at every moment.

**Tech Stack:** CloudFront Functions (`cloudfront-js-2.0`), AWS CLI v2, Bun test, Python 3 (JSON edits of the distribution config).

**Spec:** `docs/superpowers/specs/2026-10-13-cloudfront-api-404-design.md`

## Global Constraints

- Distribution `EIH8J5L7N96GZ`. Function name `stylify-spa-rewrite`, runtime `cloudfront-js-2.0`, event type `viewer-request`, associated with the **default behaviour only**. Never associate it with `/api/*`.
- **Ask Minh before each `aws cloudfront update-distribution`** (there are two). Read-only AWS commands, `create-function`, `test-function` and `publish-function` change nothing that serves traffic and need no confirmation.
- The `/api/*` behaviour is not edited: its origin request policy stays `AllViewerExceptHostHeader` (`b689b0a8-53d0-40ab-baf2-68738e2966ac`).
- Every distribution update is made by editing the JSON that `get-distribution-config` returned in the same step and sending it back with that response's `ETag`. Never hand-write a distribution config.
- The backup directory is outside the repo: `~/stylify-cloudfront-backup-2026-10-13/`. Nothing from it is committed.
- No change under `server/`, `shared/`, `frontend/`, root `package.json` or `.github/` (those deploy). `infra/` and `docs/` do not deploy.
- No S3 bucket policy change. A missing asset answering 403 is accepted.
- `mobile/src/lib/unmaskNotFound.ts` is not removed.
- Never print or commit `.env` values. Bun is 1.3.13.
- Work on branch `fix/cloudfront-api-404` (from `docs/cloudfront-404-spec`); reach `main` only with `git merge --ff-only`, and ask Minh before pushing `main`.

## Review Focus

1. **A deep link with a trailing slash or a query string** (`/edit-item/123/`, `/profile?tab=x`) must load the app. (Task 1 unit tests; Task 2 curl.)
2. **The root path `/`** must still load the app once the error responses are gone. (Task 1 unit test; Task 3 curl.)
3. **A real static file** (`/assets/<hash>.js`, `/favicon.ico` if present, `/index.html`) must not be rewritten to HTML. (Task 1 unit tests; Task 2 curl comparing `content-type`.)
4. **`www.stylify.space`** shares the distribution and must behave like the apex. (Tasks 2 and 3 curl.)
5. **API answers other than 404** (401 signed out, the login redirect at `/api/login`) must be unchanged. (Tasks 2 and 3 curl.)

---

### Task 1: The rewrite function and its test

**Files:**
- Create: `infra/cloudfront/spa-rewrite.js`
- Create: `infra/cloudfront/spa-rewrite.test.ts`

**Interfaces:**
- Produces: a CloudFront Function source file defining a top-level `function handler(event)` that returns `event.request`. Tasks 2 uploads this exact file.

CloudFront Functions are scripts, not modules: the file must not use `export`, `import` or `module.exports`. The test therefore loads the file as text and evaluates it.

- [ ] **Step 1: Branch**

```bash
git checkout docs/cloudfront-404-spec && git checkout -b fix/cloudfront-api-404
bun --version   # 1.3.13
```

- [ ] **Step 2: Write the failing test**

`infra/cloudfront/spa-rewrite.test.ts`:

```ts
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// A CloudFront Function is a script with a top-level handler, not a module,
// so it is loaded as text and evaluated.
const source = readFileSync(join(import.meta.dir, 'spa-rewrite.js'), 'utf8')
const handler = new Function(`${source}; return handler`)() as (event: {
  request: { uri: string; querystring: Record<string, unknown> }
}) => { uri: string; querystring: Record<string, unknown> }

const rewrite = (uri: string) => handler({ request: { uri, querystring: {} } }).uri

describe('spa-rewrite', () => {
  test.each([
    ['/'],
    ['/about'],
    ['/profile'],
    ['/create-item'],
    ['/edit-item/123'],
    ['/edit-item/123/'],
    ['/some.thing/page'],
  ])('%s is served by the app shell', (uri) => {
    expect(rewrite(uri)).toBe('/index.html')
  })

  test.each([
    ['/index.html'],
    ['/assets/index-abc123.js'],
    ['/assets/index-abc123.css'],
    ['/favicon.ico'],
    ['/nested/dir/file.min.js'],
  ])('%s is left alone', (uri) => {
    expect(rewrite(uri)).toBe(uri)
  })

  test('the query string is not touched', () => {
    const querystring = { tab: { value: 'x' } }
    const result = handler({ request: { uri: '/profile', querystring } })
    expect(result.uri).toBe('/index.html')
    expect(result.querystring).toBe(querystring)
  })

  test('the file is a script, not a module', () => {
    expect(source).not.toMatch(/^\s*(export|import)\s/m)
    expect(source).not.toContain('module.exports')
  })
})
```

- [ ] **Step 3: Run it to see it fail**

Run: `bun test ./infra`
Expected: FAIL — `ENOENT … spa-rewrite.js`.

- [ ] **Step 4: Write the function**

`infra/cloudfront/spa-rewrite.js`:

```js
// CloudFront Function (cloudfront-js-2.0), viewer-request, default (S3) behaviour only.
// Client-side routes have no file extension; serve the app shell for them.
// Published by hand: see docs/cloud-architecture.md.
function handler(event) {
  var request = event.request
  var lastSegment = request.uri.substring(request.uri.lastIndexOf('/') + 1)
  if (lastSegment.indexOf('.') === -1) {
    request.uri = '/index.html'
  }
  return request
}
```

- [ ] **Step 5: Run the tests**

Run: `bun test ./infra`
Expected: PASS, 14 tests.

Also run `bun test ./server` (33 pass) to confirm the new folder did not disturb the existing run.

- [ ] **Step 6: Commit**

```bash
git add infra/cloudfront && git commit -m "feat(infra): CloudFront Function that serves the app shell for client routes"
```

---

### Task 2: Rollout step 1 — publish the function and attach it

**Files:** none in the repo. Working files go in `~/stylify-cloudfront-backup-2026-10-13/`.

**Interfaces:**
- Consumes: `infra/cloudfront/spa-rewrite.js` from Task 1.
- Produces: function `stylify-spa-rewrite` in stage LIVE, associated with the default behaviour; `dist-before.json` (the rollback input) in the backup directory.

- [ ] **Step 1: Check the session and record the starting behaviour**

```bash
aws sts get-caller-identity --query Account --output text >/dev/null && echo "aws ok"   # if it fails, Minh runs: aws login
B=~/stylify-cloudfront-backup-2026-10-13 && mkdir -p $B
for u in / /about /profile /edit-item/123 /edit-item/123/ '/profile?tab=x' /index.html /api/nonexistent /api/me /api/login; do
  printf '%-22s ' "$u"; curl -s -o /dev/null -w '%{http_code} %{content_type}\n' "https://stylify.space$u"
done | tee $B/before.txt
ASSET=$(curl -s https://stylify.space/ | grep -oE '/assets/[^"]+\.js' | head -1); echo "$ASSET" | tee $B/asset.txt
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' "https://stylify.space$ASSET"   # 200 …javascript
```

Expected: every page path and `/api/nonexistent` is `200 text/html`; `/api/me` is `401 application/json`; `/api/login` is a `302`.

- [ ] **Step 2: Back up the distribution config**

```bash
aws cloudfront get-distribution-config --id EIH8J5L7N96GZ > $B/dist-before.json
python3 -c "import json;d=json.load(open('$B/dist-before.json'));c=d['DistributionConfig'];print(c['CustomErrorResponses']['Quantity'], c['DefaultCacheBehavior']['FunctionAssociations']['Quantity'])"
```

Expected: `2 0`. If not, stop: the distribution is not in the state the spec describes.

- [ ] **Step 3: Create, test and publish the function**

```bash
aws cloudfront create-function --name stylify-spa-rewrite \
  --function-config 'Comment=SPA deep links: extensionless paths to /index.html,Runtime=cloudfront-js-2.0' \
  --function-code fileb://infra/cloudfront/spa-rewrite.js > $B/fn-create.json
FN_ETAG=$(python3 -c "import json;print(json.load(open('$B/fn-create.json'))['ETag'])")

for uri in /profile /assets/x.js; do
  printf '{"version":"1.0","context":{"eventType":"viewer-request"},"viewer":{"ip":"198.51.100.1"},"request":{"method":"GET","uri":"%s","querystring":{},"headers":{},"cookies":{}}}' "$uri" > $B/event.json
  aws cloudfront test-function --name stylify-spa-rewrite --if-match $FN_ETAG --stage DEVELOPMENT \
    --event-object fileb://$B/event.json --query 'TestResult.[FunctionErrorMessage,FunctionOutput]' --output text
done
```

Expected: no error message; the first output contains `"uri":"/index.html"`, the second `"uri":"/assets/x.js"`. If either is wrong, stop (nothing is attached yet; delete the function with `aws cloudfront delete-function --name stylify-spa-rewrite --if-match $FN_ETAG`).

```bash
aws cloudfront publish-function --name stylify-spa-rewrite --if-match $FN_ETAG > $B/fn-publish.json
FN_ARN=$(python3 -c "import json;print(json.load(open('$B/fn-publish.json'))['FunctionSummary']['FunctionMetadata']['FunctionARN'])"); echo $FN_ARN
```

- [ ] **Step 4: Ask Minh, then attach the function to the default behaviour**

Tell Minh: "This attaches the function to the S3 behaviour. The 403/404 error responses stay as a safety net. Rollback is removing the association." Wait for a yes.

```bash
aws cloudfront get-distribution-config --id EIH8J5L7N96GZ > $B/dist-step1-in.json
python3 - "$B" "$FN_ARN" <<'EOF'
import json, sys
b, arn = sys.argv[1], sys.argv[2]
d = json.load(open(f'{b}/dist-step1-in.json'))
c = d['DistributionConfig']
assert c['DefaultCacheBehavior']['FunctionAssociations']['Quantity'] == 0
c['DefaultCacheBehavior']['FunctionAssociations'] = {
    'Quantity': 1,
    'Items': [{'FunctionARN': arn, 'EventType': 'viewer-request'}],
}
assert c['CustomErrorResponses']['Quantity'] == 2          # untouched in this step
json.dump(c, open(f'{b}/dist-step1-out.json', 'w'))
print(d['ETag'])
EOF
DIST_ETAG=$(python3 -c "import json;print(json.load(open('$B/dist-step1-in.json'))['ETag'])")
aws cloudfront update-distribution --id EIH8J5L7N96GZ --if-match $DIST_ETAG \
  --distribution-config file://$B/dist-step1-out.json --query 'Distribution.Status' --output text
aws cloudfront wait distribution-deployed --id EIH8J5L7N96GZ && echo deployed
```

- [ ] **Step 5: Verify**

```bash
for h in stylify.space www.stylify.space; do for u in / /about /profile /edit-item/123 /edit-item/123/ '/profile?tab=x' /index.html; do
  printf '%-18s %-22s ' $h "$u"; curl -s -o /dev/null -D - "https://$h$u" | awk 'BEGIN{ORS=" "} NR==1{print $2} tolower($1)~/^(content-type|x-cache):/{gsub("\r","");print}'; echo
done; done
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' "https://stylify.space$(cat $B/asset.txt)"   # 200 …javascript
curl -s -o /dev/null -w '%{http_code}\n' https://stylify.space/api/me                                  # 401
curl -s -o /dev/null -w '%{http_code}\n' https://stylify.space/api/login                               # 302
```

Expected: every page path is `200 text/html` and its `x-cache` is `Hit from cloudfront` or `Miss from cloudfront` — **not** `Error from cloudfront`, which would mean the page is still being served by the error fallback rather than the function. The asset is JavaScript. `/api/nonexistent` is still `200 text/html` at this point (fixed in Task 3).

Ask Minh to load `https://stylify.space/profile` directly in a browser and confirm the app opens.

If a page path fails: roll back by re-sending `dist-step1-in.json`'s `DistributionConfig` with the current ETag, and stop.

---

### Task 3: Rollout step 2 — remove the custom error responses

**Files:** none in the repo.

**Interfaces:**
- Consumes: the distribution as Task 2 left it (function attached and verified).

- [ ] **Step 1: Ask Minh, then remove both error responses**

Tell Minh: "This removes the 403/404 → index.html error responses. After it, API 404s reach clients as 404. Rollback is re-applying the saved config." Wait for a yes.

```bash
B=~/stylify-cloudfront-backup-2026-10-13
aws cloudfront get-distribution-config --id EIH8J5L7N96GZ > $B/dist-step2-in.json
python3 - "$B" <<'EOF'
import json, sys
b = sys.argv[1]
d = json.load(open(f'{b}/dist-step2-in.json'))
c = d['DistributionConfig']
assert c['DefaultCacheBehavior']['FunctionAssociations']['Quantity'] == 1   # Task 2 is in place
assert c['CustomErrorResponses']['Quantity'] == 2
c['CustomErrorResponses'] = {'Quantity': 0}
json.dump(c, open(f'{b}/dist-step2-out.json', 'w'))
EOF
DIST_ETAG=$(python3 -c "import json;print(json.load(open('$B/dist-step2-in.json'))['ETag'])")
aws cloudfront update-distribution --id EIH8J5L7N96GZ --if-match $DIST_ETAG \
  --distribution-config file://$B/dist-step2-out.json --query 'Distribution.Status' --output text
aws cloudfront wait distribution-deployed --id EIH8J5L7N96GZ && echo deployed
```

- [ ] **Step 2: Verify with curl**

```bash
for h in stylify.space www.stylify.space; do for u in / /about /profile /edit-item/123 '/profile?tab=x' /api/nonexistent /api/me /api/login /assets/nope.js; do
  printf '%-18s %-20s ' $h "$u"; curl -s -o /dev/null -w '%{http_code} %{content_type}\n' "https://$h$u"
done; done | tee $B/after.txt
curl -s -o /dev/null -w '%{http_code} %{content_type}\n' "https://stylify.space$(cat $B/asset.txt)"
```

Expected on both hosts:

| Path | Result |
|---|---|
| `/`, `/about`, `/profile`, `/edit-item/123`, `/profile?tab=x` | `200 text/html` |
| `/api/nonexistent` | `404` (not `text/html`) |
| `/api/me` | `401 application/json` |
| `/api/login` | `302` |
| `/assets/nope.js` | `403` |
| the real asset | `200`, JavaScript |

If any page path is not `200 text/html`, roll back at once:

```bash
aws cloudfront get-distribution-config --id EIH8J5L7N96GZ --query ETag --output text   # current ETag
aws cloudfront update-distribution --id EIH8J5L7N96GZ --if-match <that ETag> --distribution-config file://$B/dist-step2-in-config.json
```

(`dist-step2-in-config.json` is the `DistributionConfig` object of `dist-step2-in.json`; write it with `python3 -c "import json;json.dump(json.load(open('$B/dist-step2-in.json'))['DistributionConfig'],open('$B/dist-step2-in-config.json','w'))"` before Step 1's update so it is ready.)

- [ ] **Step 3: Minh checks the web app and the phone**

Browser: load `https://stylify.space/profile` directly; log in; create an item named `TEST`; edit it; open its edit page in a second tab, delete it in the first, reload the second (an error state, not a blank or broken page); log out.

Phone (Metro running): delete an item on the web, open it on the phone → "This item no longer exists" (now from a real 404).

Record the results. A web-app problem found here that needs a frontend change is reported to Minh as a separate, deploying change; it is not made in this plan.

---

### Task 4: Documentation and merge

**Files:**
- Modify: `docs/cloud-architecture.md` (the "SPA Routing Configuration" section near line 410 and the behaviours table near line 458)
- Modify: `AGENTS.md` (Deployment section; the CloudFront 404 bullet under "Rules that are easy to break"; Commands)
- Modify: `docs/mobile.md` (the CloudFront paragraph and Known limits)
- Modify: `docs/superpowers/specs/2026-10-13-cloudfront-api-404-design.md` (status)

Write only what Tasks 2 and 3 actually produced. If the rollout stopped after Task 2, document that state instead.

- [ ] **Step 1: `docs/cloud-architecture.md`**

Replace the "SPA Routing Configuration" body with: client routes are served by the CloudFront Function `stylify-spa-rewrite` (source `infra/cloudfront/spa-rewrite.js`, viewer-request, default behaviour only), which rewrites any path whose last segment has no dot to `/index.html`; the distribution has **no** custom error responses, because they apply to every origin and turned API 403/404 answers into `200 text/html`; a missing static file answers 403 (the bucket policy has no `s3:ListBucket`). In the behaviours table change the default row's last cell to "Cache aggressively; `stylify-spa-rewrite` serves `index.html` for client routes". Add a short "Changing the function" block:

```bash
bun test ./infra
ETAG=$(aws cloudfront describe-function --name stylify-spa-rewrite --query ETag --output text)
aws cloudfront update-function --name stylify-spa-rewrite --if-match $ETAG \
  --function-config 'Comment=SPA deep links: extensionless paths to /index.html,Runtime=cloudfront-js-2.0' \
  --function-code fileb://infra/cloudfront/spa-rewrite.js
# test-function against /profile and /assets/x.js, then:
aws cloudfront publish-function --name stylify-spa-rewrite --if-match <ETag from update-function>
```

Also correct the earlier troubleshooting passage (near line 295) that says a 403 from API Gateway is turned into `index.html`: add one sentence that this masking was removed on the date of Task 3.

- [ ] **Step 2: `AGENTS.md`**

- Deployment, after the CloudFront line: "Client routes are served by the CloudFront Function `stylify-spa-rewrite` (`infra/cloudfront/spa-rewrite.js`) on the default behaviour. Do not add custom error responses to the distribution: they apply to `/api/*` too and turn API 404s into `200 text/html`."
- Rules: replace the bullet that says CloudFront's SPA fallback turns API 404s into `200 text/html` with: "API 404s reach clients as 404 since <date>. `mobile/src/lib/unmaskNotFound.ts` is kept as a guard and is a no-op while that holds."
- Commands: add `bun test ./infra                 # CloudFront Function tests`.
- Layout block: add `infra/      CloudFront Function source. Published by hand; not deployed by CI.`

- [ ] **Step 3: `docs/mobile.md`**

Reword the CloudFront paragraph: the masking was removed from the distribution on <date>; `unmaskNotFound` remains as a guard. Remove the matching Known-limits line if there is one.

- [ ] **Step 4: Spec status**

Set `Status: implemented (<date>)`.

- [ ] **Step 5: Final checks and commit**

```bash
bun test ./infra && bun test ./server && (cd frontend && bun run typecheck)
git add docs AGENTS.md && git commit -m "docs: CloudFront serves client routes with a function; API 404s are no longer masked"
```

- [ ] **Step 6: Merge (needs Minh's OK)**

```bash
git diff --stat main...fix/cloudfront-api-404 -- server shared frontend package.json .github   # must print nothing
git checkout main && git merge --ff-only fix/cloudfront-api-404 && git push origin main
gh run list --limit 3     # no new deploy runs
```
