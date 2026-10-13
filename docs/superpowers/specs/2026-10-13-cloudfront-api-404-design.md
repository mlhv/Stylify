# CloudFront: stop masking API 404s

Status: draft, awaiting review
Date: 2026-10-13

## Problem

CloudFront distribution `EIH8J5L7N96GZ` has two custom error responses: origin 403 → `/index.html` with status 200, and origin 404 → `/index.html` with status 200. They exist so that a deep link to a client-side route (`/profile`) loads the SPA. Custom error responses apply to the whole distribution, so they also rewrite answers from the API origin:

| Request (2026-10-13) | Answer today | Wanted |
|---|---|---|
| `/about`, `/profile`, `/edit-item/123` | 200 `text/html` (through the error fallback) | 200 `text/html` |
| `/api/nonexistent` | 200 `text/html` | 404 from the API |
| `GET /api/wardrobe/:id` for a deleted item (signed in) | 200 `text/html` | 404 from the API |
| `/assets/nope.js` | 200 `text/html` | an error status |
| `/api/me` signed out | 401 JSON | unchanged |

The phone app works around this in `mobile/src/lib/unmaskNotFound.ts`. The web app does not: a missing item reaches it as a 200 HTML page and fails as a JSON parse error.

## Goal

API responses reach the client with the status the API sent. Deep links keep loading. Nothing else about the site changes.

Not in scope: moving the API to its own domain, infrastructure-as-code, changing the API, removing `unmaskNotFound`.

## Current configuration (read 2026-10-13)

- Origins: S3 `stylify-frontend` (origin access control `E16G9DXN5D91R`) and API Gateway `qc21edd692`.
- Default behaviour → S3, GET/HEAD, no function associations. `/api/*` → API Gateway, no function associations.
- Default root object `index.html`. Aliases `stylify.space`, `www.stylify.space`.
- Custom error responses: 403 and 404, both → `/index.html`, 200, error caching 10 s.
- No CloudFront Functions exist in the account.
- The bucket policy grants `s3:GetObject` only, so S3 answers 403 (not 404) for a missing key.

## Design

Move the SPA fallback from "rewrite error responses" to "rewrite the request", on the S3 behaviour only.

### 1. CloudFront Function `stylify-spa-rewrite`

Runtime `cloudfront-js-2.0`, event type viewer-request, associated with the **default behaviour only**. `/api/*` matches its own behaviour first and never runs it.

Rule: if the last path segment contains no dot, set `request.uri` to `/index.html`; otherwise return the request unchanged.

| URI | Result |
|---|---|
| `/` | `/index.html` |
| `/profile`, `/edit-item/123`, `/edit-item/123/` | `/index.html` |
| `/assets/index-abc123.js`, `/favicon.ico`, `/index.html` | unchanged |
| `/some.thing/page` | `/index.html` (only the last segment counts) |

The query string is untouched. No current route has a dot in its last segment (item IDs are integers); a future route that does would need this rule revisited.

Source: `infra/cloudfront/spa-rewrite.js`, with `infra/cloudfront/spa-rewrite.test.ts` (run with `bun test ./infra`) covering the table above. `infra/` is not a workspace and not a deploy trigger. The function is published by hand with the AWS CLI; the file in the repo is the source of truth.

### 2. Remove both custom error responses

Once the function serves deep links, the 403 and 404 error responses are deleted. Origin statuses then pass through for both origins.

Result:

| Request | After |
|---|---|
| `/`, `/about`, `/profile`, `/edit-item/123` | 200 `text/html` |
| `/api/nonexistent`, a deleted item | 404 from the API |
| `/api/me` signed out | 401 |
| `/assets/nope.js` | 403 from S3 (accepted; a true 404 would need `s3:ListBucket` on the bucket, which is not added) |
| An API Gateway 403 | 403, no longer an HTML page |

### Clients

- **Web:** every function in `frontend/src/lib/api.ts` throws on `!res.ok`, so a real 404 becomes the existing error path instead of a JSON parse failure. No frontend change, no frontend deploy.
- **Mobile:** `unmaskNotFound` acts only on a 2xx non-JSON answer, so it becomes a no-op. It stays; removing it is a later clean-up.

## Rollout

Two steps, so deep links are served at every moment.

0. Save the distribution config and its ETag to a file outside the repo (the rollback input). Run `bun test ./infra`.
1. Create and publish the function. Test it with `aws cloudfront test-function` for `/profile` and `/assets/x.js`. Update the distribution: add the viewer-request association to the default behaviour. Wait for `Deployed`. The error responses are still present as a safety net. Verify deep links and assets load, in the browser and with `curl`.
2. Update the distribution: remove both custom error responses. Wait for `Deployed`. Verify the result table with `curl`, then in a browser: load `/profile` directly, log in, create an item, edit it, delete it, open a deleted item's edit URL, log out. Verify the phone app still shows "This item no longer exists" for an item deleted on the web.

Each update is confirmed with Minh before it is applied.

### Rollback

Re-apply the saved config with `aws cloudfront update-distribution` (using the current ETag). After step 1 only: removing the association is enough. Propagation takes a few minutes either way. The function can stay published and unattached.

### Risks

- **A deep link stops loading** if the function is wrong. Mitigated by the unit test, `test-function`, and step 1 keeping the error responses.
- **Cached error pages:** error caching is 10 s, so old masked answers expire quickly; no invalidation is needed.
- **A stale browser asks for an old hashed asset after a deploy** and now gets 403 instead of HTML-as-JavaScript. Both fail to run; the new failure is the honest one.
- **Cost:** CloudFront Functions are free for the first 2,000,000 invocations a month.

## Documentation

- `docs/cloud-architecture.md`: replace the "SPA Routing Configuration" text and the behaviours table with the function; add the commands used.
- `AGENTS.md`: Deployment — name the function and state that the 403/404 custom error responses must not be re-added; Rules — reword the CloudFront 404 bullet to say it is fixed and why `unmaskNotFound` remains.
- `docs/mobile.md`: update the CloudFront paragraph and the known limits.
