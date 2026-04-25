# Cloud Deployment Architecture

## The Problem with Always-On Servers

The original deployment runs on an EC2 t3.micro instance — a virtual machine that runs 24/7.
Think of it like **renting an apartment you only visit occasionally**. You pay for it while you sleep,
while no one is using the app, always. A t3.micro running 730 hours a month costs the same whether
it gets 1 request or 1 million (~$8.35/mo for EC2 + ~$3.65/mo for the public IPv4 address).

The serverless approach flips this: **you only pay when someone actually uses the app.**
For a personal project with low traffic, that's essentially free.

---

## Architecture Overview

```
                     yourdomain.com
                    (Porkbun DNS → CloudFront)
                             │
               ┌─────────────┴──────────────┐
               │                            │
          /api/* paths                /* all other paths
               │                            │
               ↓                            ↓
         API Gateway                 CloudFront Edge
               │                     (cached globally)
               ↓                            │
       Lambda Function                      ↓
    (container pulled               S3 Bucket
       from ECR)               (React HTML / JS / CSS)
               │
     ┌─────────┼─────────┐
     ↓         ↓         ↓
   Neon      Kinde       S3
 (Postgres)  (Auth)   (Images)
```

One CloudFront distribution sits in front of everything. It inspects the URL path of every
incoming request and routes it to the right place — S3 for the frontend, API Gateway → Lambda
for all `/api/*` calls. The browser sees one seamless domain.

---

## Cost Breakdown

| Resource | EC2 Setup | Serverless Setup |
|---|---|---|
| EC2 t3.micro | ~$8.35/mo | $0 (eliminated) |
| Public IPv4 address | ~$3.65/mo | $0 (eliminated) |
| Lambda (1M req/mo free tier) | — | ~$0 |
| API Gateway HTTP API | — | ~$0 (cents at low traffic) |
| S3 static hosting | — | ~$0.05/mo |
| CloudFront (1TB + 10M req free) | — | $0 |
| ECR (Docker image storage) | — | ~$0.10/mo |
| **Total** | **~$12/mo** | **~$0.15/mo** |

---

## Component 1: Docker & ECR

### What is Docker?

Docker is a way to package your app and everything it needs to run into a single sealed unit
called an **image**. Think of it like packing IKEA furniture into a box with all the parts and
instructions — anyone who opens the box can reassemble it exactly the same way, on any machine.

The `server/Dockerfile` is the packing instructions:

```dockerfile
FROM public.ecr.aws/awsguru/aws-lambda-adapter:0.9.0 AS aws-lambda-adapter
FROM oven/bun:debian
# ↑ "start with a box that has Bun pre-installed"

COPY --from=aws-lambda-adapter /lambda-adapter /opt/extensions/lambda-adapter
# ↑ include the Lambda Adapter (explained below)

ENV PORT=8080
WORKDIR /var/task

COPY package.json bun.lockb ./
RUN bun install --production --frozen-lockfile
# ↑ install dependencies inside the box

COPY server/ ./server/
# ↑ put your server code in the box

CMD ["bun", "server/index.ts"]
# ↑ when the box is opened (container starts), run this
```

Running `docker build` follows these instructions and produces a **Docker image** — a
self-contained snapshot of your app. A running instance of that image is called a **container**.

### What is ECR?

**ECR (Elastic Container Registry)** is AWS's private storage for Docker images. Think of it
like a private GitHub, but for Docker images instead of code.

```
Your machine                          AWS
┌────────────────┐                ┌──────────────────┐
│  docker build  │──docker push──→│  ECR             │
│  (builds the   │                │  (stores image,  │
│   image)       │                │   gives it a URL)│
└────────────────┘                └────────┬─────────┘
                                           │ Lambda pulls from here
                                           ↓
                                  ┌──────────────────┐
                                  │  Lambda Function │
                                  └──────────────────┘
```

Lambda needs to pull your app image from somewhere when it wakes up. ECR is that
somewhere — AWS-internal, so the transfer is fast and free.

### Deployment Commands

```bash
# 1. Create the ECR repository (one time only)
aws ecr create-repository --repository-name stylify-backend --region us-east-2

# 2. Authenticate Docker to ECR
aws ecr get-login-password --region us-east-2 | \
  docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-2.amazonaws.com

# 3. Build, tag, and push the image (run from repo root)
docker build -t stylify-backend -f server/Dockerfile .
docker tag stylify-backend:latest \
  <account-id>.dkr.ecr.us-east-2.amazonaws.com/stylify-backend:latest
docker push \
  <account-id>.dkr.ecr.us-east-2.amazonaws.com/stylify-backend:latest
```

---

## Component 2: Lambda

### What is a Lambda Function?

A Lambda function is code that AWS runs **on demand**, in response to events like an HTTP
request. There is no server to manage. AWS handles the machine, the OS, scaling, and restarts.

```
Traditional EC2:
┌─────────────────────────────────────────────┐
│  Server running 24/7                        │
│  Waiting... waiting... waiting...           │  ← you pay for all this idle time
│  Request comes in → handled                 │
│  Waiting... waiting...                      │
└─────────────────────────────────────────────┘

Lambda:
                         Request arrives
                               ↓
              AWS pulls container image from ECR
                               ↓
                     Hono handles the request
                               ↓
                        Response sent back
                               ↓
              Container stays warm ~15 minutes
              Ready for the next request
                               ↓
              No more requests → container shuts down
              AWS stops charging
```

You pay only for the milliseconds your code actually runs.

### Cold Starts

The one trade-off: if no one has used the app in a while, Lambda must **wake up** before
handling the first request. This is called a **cold start** — pulling the container from ECR
and booting Bun takes roughly 3–8 seconds for the first request after a long idle period.

After that, Lambda stays warm for ~15 minutes and subsequent requests are instant.
For a personal wardrobe app this is usually acceptable. You can optionally keep it warm
with a scheduled EventBridge ping every 5 minutes (within free tier, costs nothing).

#### Keeping Lambda Warm with EventBridge (Optional)

Create a scheduled rule in EventBridge that pings `/api/me` every 5 minutes:

1. Go to **EventBridge → Rules → Create rule**
2. Rule type: **Schedule**
3. Schedule pattern: `rate(5 minutes)`
4. Target: **API Gateway** → your HTTP API → path `/api/me` → method `GET`

This keeps the container warm so cold starts never happen in practice. The ping
hits `/api/me` which returns 401 (unauthenticated) — that's fine, the goal is just
to trigger Lambda, not to get a valid response. Stays within the free tier.

### The Lambda Adapter — No Code Changes Required

Lambda normally expects a specific function signature, not a web server. Your Hono app is
built as an HTTP server listening on port 8080. The **Lambda Adapter** (already in the
Dockerfile) bridges this gap:

```
Without Lambda Adapter:
  AWS sends Lambda event (JSON) → needs a handler function → returns JSON
  Hono doesn't speak this format.

With Lambda Adapter:
  AWS sends Lambda event
       ↓
  Lambda Adapter converts it to a real HTTP request
       ↓
  Sends it to Hono on port 8080 (Hono is unchanged)
       ↓
  Hono responds with a normal HTTP response
       ↓
  Lambda Adapter converts HTTP response back to Lambda format
       ↓
  AWS sends it back to the caller
```

Your entire Hono codebase — routes, middleware, auth — runs completely unchanged.

### Lambda Configuration

| Setting | Value | Reason |
|---|---|---|
| Runtime | Container image | Uses the ECR image with Bun |
| Memory | 512 MB | Plenty for Hono + Bun; t3.micro had 1 GB |
| Timeout | 30 seconds | Covers cold DB connections |
| Architecture | x86_64 | Matches the Bun debian base image |

**Environment variables** (set in Lambda config, never in code):
- `DATABASE_URL`
- `KINDE_DOMAIN`, `KINDE_CLIENT_ID`, `KINDE_CLIENT_SECRET`
- `KINDE_REDIRECT_URI`, `KINDE_LOGOUT_REDIRECT_URI`
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`

---

## Component 3: API Gateway

### What is API Gateway?

Lambda functions don't have a public URL by default — they're just code waiting to be
triggered. **API Gateway gives your Lambda a public HTTP endpoint.**

Think of it as a receptionist at the front desk:

```
Internet
   │
   │  POST https://yourdomain.com/api/wardrobe
   ↓
API Gateway ── "Got a POST to /api/wardrobe. Forwarding to Lambda."
   │
   ↓
Lambda Function ── wakes up, Hono handles the request
   │
   ↓
API Gateway ── "Lambda responded 200 + JSON. Sending back to browser."
   │
   ↓
Browser receives response
```

This project uses **HTTP API (v2)** — the simpler, cheaper version of API Gateway
($1/million requests vs $3.50/million for REST API). It uses a single `$default` route
that forwards all paths and methods to Lambda. Hono's own router then decides which
handler runs based on the path.

---

### The Host Header Bug (and Why It Took So Long to Find)

During the initial setup, every request to `stylify.space/api/*` was returning
`index.html` instead of hitting Lambda. CloudFront logs showed `x-cache: Error from
cloudfront` and `server: AmazonS3` — meaning S3 was responding, not API Gateway.
The CloudFront behavior looked correct in the console, the distribution was deployed,
and the API Gateway URL was right. Lambda had zero log entries.

**The root cause:**

CloudFront's `Managed-AllViewer` origin request policy forwards **all** viewer request
headers to the origin — including the `Host` header. When a browser visits
`stylify.space/api/login`, the request arrives at CloudFront with `Host: stylify.space`.
CloudFront then forwards that exact Host header to API Gateway.

API Gateway only accepts requests where the Host header matches its own domain
(`qc21edd692.execute-api.us-east-1.amazonaws.com`). When it receives
`Host: stylify.space`, it returns a **403 Forbidden** — before Lambda is ever invoked.

CloudFront then hits the custom error page rule (403 → serve `index.html` with 200),
so the browser receives `index.html` from S3 instead of the API response. This made it
look like the behavior wasn't routing to API Gateway at all, when in reality it was —
and API Gateway was immediately rejecting every request.

```
Browser → stylify.space/api/login
              │
              ↓
        CloudFront (behavior: /api/* → API Gateway)
              │
              │  Host: stylify.space  ← forwarded from viewer by AllViewer policy
              ↓
        API Gateway → 403 Forbidden  ← doesn't recognize stylify.space as its domain
              │
              ↓
        CloudFront custom error rule: 403 → serve index.html with 200
              │
              ↓
        Browser receives index.html  ← looks like S3, not API Gateway
```

**Why it was hard to debug:**

- Lambda had no logs (correct — API Gateway rejected before invoking Lambda)
- The response showed `server: AmazonS3` (the custom error page came from S3)
- `x-cache: Error from cloudfront` looked like a caching issue, not an auth issue
- The CloudFront behavior and origin config were both correct — the problem was
  a single policy setting, invisible unless you tested API Gateway directly with
  the wrong Host header

**The fix:**

Change the CloudFront `/api/*` behavior's Origin request policy from
`Managed-AllViewer` to **`Managed-AllViewerExceptHostHeader`**.

This forwards everything (cookies, headers, query strings) to API Gateway — but
strips the Host header, letting CloudFront substitute the origin domain instead.
API Gateway sees `Host: qc21edd692.execute-api.us-east-1.amazonaws.com` and
accepts the request. Kinde auth cookies are still forwarded, so authentication
works correctly.

**Confirmed with:**
```bash
# This returns 403 — API Gateway rejects the wrong Host header
curl -H "Host: da7wcxqusialv.cloudfront.net" \
  https://qc21edd692.execute-api.us-east-1.amazonaws.com/api/login

# This returns 302 → Kinde — correct behavior through CloudFront
curl https://stylify.space/api/login
```

---

## Component 4: S3 + CloudFront (Frontend)

### What is S3?

**S3 (Simple Storage Service)** is AWS's cloud file storage — like Google Drive,
but for apps.

When you run `bun run build` in the frontend directory, Vite compiles your React app
into a folder of plain static files:

```
frontend/dist/
├── index.html            ← the single HTML page
└── assets/
    ├── index-abc123.js   ← all React code, bundled
    └── index-def456.css
```

A React SPA in production is just files — no server-side rendering, no Node process.
S3 stores these files and can serve them to browsers like a simple file server in the cloud.

```bash
# Build the frontend
cd frontend && bun run build

# Create the S3 bucket
aws s3 mb s3://stylify-frontend-yourname --region us-east-2

# Upload the build output
aws s3 sync dist/ s3://stylify-frontend-yourname/
```

S3 is configured with **public access blocked** — CloudFront accesses it privately
via Origin Access Control (OAC). Browsers never talk to S3 directly.

### What is CloudFront?

S3 alone has a latency problem: if your bucket is in `us-east-2` (Ohio) and someone
visits from Tokyo, every file request crosses the Pacific Ocean.

**CloudFront is a CDN (Content Delivery Network).** It has servers in ~600 locations
worldwide called **edge locations**. When someone requests your site, they get files
from the nearest edge location, not from Ohio:

```
User in Tokyo                          User in London
      │                                      │
      ↓                                      ↓
CloudFront edge (Tokyo)          CloudFront edge (London)
      │                                      │
      └─────────────────┬────────────────────┘
                        ↓ fetches from S3 once, then caches at the edge
                   S3 bucket (Ohio)
```

CloudFront also:
- **Handles HTTPS** — provides a valid SSL certificate for your domain
- **Caches files at the edge** — your JS bundle isn't re-downloaded from S3 on every visit
- **Custom domain support** — attach your Porkbun domain

### SPA Routing Configuration

Because this is a single-page app, all routes (`/`, `/create-item`, `/profile`, etc.)
are handled client-side by TanStack Router. But S3 only knows about `index.html` —
if someone bookmarks `yourdomain.com/profile` and navigates directly to it, S3 returns
a 403 (file not found).

Fix: configure CloudFront to return `index.html` with a `200` status for any 403/404
error. The React app boots, TanStack Router reads the URL, and renders the right page.

---

## Component 5: Domain & DNS

### How the Domain Connects Everything

Your Porkbun domain is just a name. **DNS (Domain Name System)** is the phone book
that translates `yourdomain.com` into an IP address a browser can connect to.

You add a **CNAME record** in Porkbun's DNS settings pointing your domain at CloudFront:

```
yourdomain.com  →  CNAME  →  d1abc2def3.cloudfront.net
www.yourdomain.com  →  CNAME  →  d1abc2def3.cloudfront.net
```

Now when anyone types `yourdomain.com`:
1. Browser looks up DNS → finds the CloudFront address
2. Browser connects to the nearest CloudFront edge server
3. CloudFront checks the path → routes to S3 or API Gateway

### HTTPS / SSL Certificate

For the padlock to appear, you need a certificate proving you own the domain.
**AWS Certificate Manager (ACM)** issues this for free.

> Important: The certificate must be created in **us-east-1** (Virginia), regardless
> of where the rest of your resources live. CloudFront requires this.

1. Request a certificate in ACM (us-east-1) for `yourdomain.com` and `*.yourdomain.com`
2. ACM gives you a CNAME record to add in Porkbun DNS (proves ownership)
3. Wait ~5 minutes for ACM to validate
4. Attach the certificate to your CloudFront distribution

### CloudFront Path Routing

One CloudFront distribution handles both the frontend and the API using **cache behaviors**:

| Path Pattern | Origin | Behavior |
|---|---|---|
| `/api/*` | API Gateway URL | Forward all headers + methods, no caching |
| `/*` (default) | S3 bucket | Cache aggressively, return `index.html` on 404 |

The browser never knows the HTML came from S3 and the data came from Lambda.
It all looks like one seamless domain.

---

## Full Request Traces

### Loading the App (`yourdomain.com`)

```
1. User types yourdomain.com in browser
2. DNS lookup: yourdomain.com → d1abc.cloudfront.net
3. Browser connects to nearest CloudFront edge
4. CloudFront: path "/" matches default behavior → S3 origin
5. CloudFront checks edge cache → if cached, returns immediately
6. If not cached: CloudFront fetches index.html from S3 (Ohio)
7. Browser receives index.html, downloads JS bundle
8. React app boots, TanStack Router renders the matched route
```

### API Call (`yourdomain.com/api/wardrobe`)

```
1. React app calls api.wardrobe.$get() (Hono RPC)
2. Browser sends: GET https://yourdomain.com/api/wardrobe + cookies
3. DNS → CloudFront edge
4. CloudFront: path "/api/*" → API Gateway origin
5. API Gateway forwards request to Lambda
6. Lambda: cold start if idle (3–8s), or instant if warm
7. Lambda Adapter converts event → HTTP request → Hono on port 8080
8. Hono middleware chain: logger → getUser (verifies Kinde cookies) → handler
9. Handler: Drizzle query → Neon Postgres → returns rows
10. Hono: return c.json({ items })
11. Lambda Adapter converts HTTP response → Lambda response format
12. API Gateway → CloudFront → browser
13. TanStack Query stores result in cache, React re-renders
```

### Logging In (`yourdomain.com/api/login`)

```
1. User clicks Login → browser navigates to /api/login
2. CloudFront: /api/* → API Gateway → Lambda → Hono
3. Hono auth route: kindeClient.login() → 302 redirect to Kinde
4. User logs in on Kinde's hosted page
5. Kinde redirects to yourdomain.com/api/callback?code=...
6. CloudFront → API Gateway → Lambda → Hono
7. kindeClient.handleRedirectToApp() exchanges code for tokens
8. Tokens stored as httpOnly cookies on yourdomain.com
9. 302 redirect to yourdomain.com (home page)
10. All future /api/* requests automatically include the cookies
```

---

## Deployment Checklist

### One-Time Setup
- [ ] Create ECR repository
- [ ] Create S3 bucket for frontend (block all public access)
- [ ] Request ACM certificate in **us-east-1**
- [ ] Create CloudFront distribution with two origins (S3 + API Gateway)
- [ ] Add CNAME records in Porkbun DNS (domain → CloudFront, ACM validation)
- [ ] Update Kinde dashboard: callback URL and logout URL to `https://yourdomain.com`

### Every Deploy

#### Backend (any change to `server/`)
```bash
# 1. Re-authenticate to ECR (token expires every 12 hours)
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 779846779460.dkr.ecr.us-east-1.amazonaws.com

# 2. Rebuild image (--platform and --provenance flags required for Apple Silicon)
docker build --platform linux/amd64 --provenance=false -t stylify-backend -f server/Dockerfile .

# 3. Tag and push to ECR
docker tag stylify-backend:latest 779846779460.dkr.ecr.us-east-1.amazonaws.com/wardrobe-app:latest
docker push 779846779460.dkr.ecr.us-east-1.amazonaws.com/wardrobe-app:latest

# 4. Update Lambda to use the new image
aws lambda update-function-code \
  --function-name <your-function-name> \
  --image-uri 779846779460.dkr.ecr.us-east-1.amazonaws.com/wardrobe-app:latest \
  --region us-east-1
```

#### Frontend (any change to `frontend/src/`)
```bash
cd frontend && bun run build
aws s3 sync dist/ s3://stylify-frontend/ --delete --region us-east-1
# Invalidate CloudFront cache so changes are live immediately
aws cloudfront create-invalidation --distribution-id EIH8J5L7N96GZ --paths "/*" --region us-east-1
```

### Smoke Tests After Deploy
```bash
# API should return 401 (not authenticated) — confirms Lambda + API Gateway works
curl https://yourdomain.com/api/me

# Frontend should load — confirms S3 + CloudFront works
open https://yourdomain.com
```

Then manually: login → create item → edit item → delete item → logout.

---

## Teardown (Terminating EC2)

Once the serverless stack is verified working:

1. Stop the EC2 instance
2. Create a final AMI snapshot (optional, for rollback)
3. Terminate the EC2 instance
4. Release the Elastic IP / public IPv4 allocation

These two steps eliminate both line items from your AWS bill.
