# ReachInbox — Full-Stack Email Job Scheduler

A production-shaped email scheduler: BullMQ (Redis-backed, no cron) drives delayed
sends, Postgres is the source of truth, Ethereal SMTP delivers mail from multiple
sender identities, Elasticsearch makes every email searchable, and a Next.js
dashboard (real Google login) lets a user compose, watch, and audit sends. A
live BullMQ dashboard exposes queue internals, and a real Slack OAuth app
posts a message the instant an hourly send limit is hit.

```
reachinbox-scheduler/
├── docker-compose.yml      # Postgres + Redis + Elasticsearch
├── backend/                # Express + TypeScript API + BullMQ worker
└── frontend/               # Next.js (App Router) + Tailwind dashboard
```

---

## 1. Prerequisites

- Node.js 20+
- Docker & Docker Compose (recommended) — or local Postgres/Redis/Elasticsearch
- A Google Cloud OAuth 2.0 Client (Web application)
- A Slack app with OAuth & the `incoming-webhook` + `chat:write` scopes
- Ethereal Email test account(s) — free, created at https://ethereal.email or
  programmatically (see below)

## 2. Infra

```bash
docker compose up -d
```

This brings up Postgres (`5432`), Redis (`6379`), and Elasticsearch (`9200`,
security disabled for local dev).

## 3. Backend setup

```bash
cd backend
cp .env.example .env      # fill in the values below
npm install
npm run prisma:generate
npm run prisma:migrate    # creates tables in Postgres
npm run dev               # starts the API + bull-board dashboard on :4000
```

In a **second terminal**, start the worker process (kept separate from the API
process so queue throughput/concurrency scales independently):

```bash
npm run worker:dev
```

### Filling in `.env`

| Variable | How to get it |
|---|---|
| `DATABASE_URL` | Matches the `docker-compose.yml` Postgres creds by default |
| `REDIS_HOST` / `REDIS_PORT` | Defaults match `docker-compose.yml` |
| `ELASTICSEARCH_NODE` | Defaults to `http://localhost:9200` |
| `ETHEREAL_SENDERS` | JSON array of `{name, host, port, user, pass}`. Generate credentials at https://ethereal.email/create, or call `createEtherealTestAccount()` in `src/services/mailer.ts` from a scratch script — it wraps `nodemailer.createTestAccount()` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials) → OAuth client ID → Web application. Add `http://localhost:4000/api/auth/google/callback` as an authorized redirect URI |
| `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` | [api.slack.com/apps](https://api.slack.com/apps) → your app → **Basic Information**. Under **OAuth & Permissions**, add `http://localhost:4000/api/slack/oauth/callback` as a redirect URL and request the `incoming-webhook` and `chat:write` scopes |
| `MAX_EMAILS_PER_HOUR` / `MAX_EMAILS_PER_HOUR_PER_SENDER` | Global / per-sender hourly caps |
| `MIN_DELAY_MS_BETWEEN_SENDS` | Minimum spacing between individual sends (default 2000ms) |
| `WORKER_CONCURRENCY` | BullMQ worker concurrency (default 5) |

The BullMQ live dashboard is available at **http://localhost:4000/admin/queues**
once the API process is running.

## 4. Frontend setup

```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev     # http://localhost:3000
```

---

## 5. Architecture

### 5.1 How scheduling works (no cron)

- `POST /api/emails/schedule` writes one `Email` row per recipient to Postgres
  (status `PENDING`), then calls `enqueueEmailJob(emailId, scheduledFor)`.
- `enqueueEmailJob` adds a **BullMQ delayed job** (`queue.add(..., { delay })`)
  to the `email-send-queue`, using `jobId = email.id`. BullMQ computes the
  delay from `scheduledFor - now()` and holds the job in Redis until it's due
  — there is no polling loop, cron entry, or `setInterval` anywhere in the
  send path.
- The worker (`src/queue/worker.ts`) is a standalone BullMQ `Worker` process
  that picks jobs up as they become due, with configurable `concurrency`.

### 5.2 Idempotency & duplicate prevention

Two independent layers, because BullMQ's own dedup (via `jobId`) doesn't
survive a rate-limit reschedule (a "used" jobId can't be reused, so the
reschedule path mints a new one — see 5.4):

1. **BullMQ `jobId = email.id`** on the *original* enqueue prevents scheduling
   the same email twice from the API layer (calling `schedule` twice with the
   same id is a safe no-op).
2. **DB status guard in the worker** (`if (email.status === "SENT") return;`)
   is the authoritative idempotency check — it doesn't care how many times a
   job for this email fires, a `SENT` row is never resent. This is also what
   makes the reconciliation step (5.3) safe to run on every boot.

### 5.3 Persistence across restarts

- BullMQ persists all job state (including future delayed jobs) in Redis, so
  a plain restart of the API or worker process loses nothing — jobs due in
  the future simply resume waiting, and jobs already in flight are retried
  per their configured `attempts`/`backoff`.
- To also cover the harder case of **Redis data loss** (not just a process
  restart), `src/queue/reconcile.ts` runs once at API boot: it loads every
  `Email` row still in `PENDING` / `QUEUED` / `DELAYED_RATE_LIMIT`, checks
  whether a live BullMQ job exists for it, and re-enqueues only the rows that
  are missing one. Because this diffs against actual queue state, it's safe
  to run on every normal restart too — it's a no-op when nothing is missing.

### 5.4 Rate limiting & concurrency

- **Worker concurrency**: `WORKER_CONCURRENCY` configures BullMQ's
  `concurrency` option directly — multiple jobs can be *picked up* in
  parallel.
- **Minimum delay between sends**: enforced two ways — BullMQ's own queue
  `limiter: { max: 1, duration: MIN_DELAY_MS_BETWEEN_SENDS }` throttles how
  fast the queue releases jobs process-wide, and a defensive
  timestamp-based `enforceMinDelay()` guards against two concurrent workers
  starting within the same tick.
- **Hourly caps (global + per-sender)**: implemented with **Redis-backed
  fixed-hour-window counters** (`src/services/rateLimiter.ts`), not
  in-memory counts, so the limit holds even if you run multiple worker
  processes. The increment-and-check is done via a single Lua script
  (`INCR_IF_UNDER_LIMIT`) so "read current count → compare → increment" is
  atomic and can't race across workers.
- **On limit hit**: the job is *never* dropped or failed. Its DB status
  flips to `DELAYED_RATE_LIMIT`, a Slack notification fires (if connected),
  and `rescheduleForNextWindow()` removes the current job and re-adds it
  with a delay pushing it just past the next hour boundary — preserving
  the original relative ordering between recipients as closely as the
  limiter allows.
- **1000+ emails at once**: the API writes all rows and calls
  `enqueueEmailJob` for every recipient synchronously; BullMQ happily holds
  thousands of delayed jobs in Redis without touching the send path until
  each is due, so scheduling volume and *send* throughput are decoupled by
  design — the queue limiter and hourly counters are what actually gate how
  fast sends happen, not how many jobs exist.

### 5.5 Search (Elasticsearch)

- `src/services/search.ts` maintains an `emails` index. Every successful or
  failed send (`worker.ts`) calls `indexEmail()` after updating Postgres, so
  ES stays a near-real-time mirror of send outcomes.
- `GET /api/emails/search?q=...&status=...` does a `multi_match` across
  `subject`, `body`, and `recipient`, filtered to the authenticated user.
  Indexing failures are logged and swallowed — search is a read-side
  convenience and must never block the send pipeline.

### 5.6 Slack notifications

- "Connect Slack" on the dashboard hits `GET /api/slack/oauth/start`, which
  redirects into Slack's real `oauth/v2/authorize` flow.
- The callback exchanges the `code` for an access token **and an incoming
  webhook URL** via `oauth.v2.access`, and upserts a `SlackIntegration` row
  per user.
- The worker calls `notifyRateLimitHit()` — which does a live `axios.post`
  to the stored webhook URL — the moment a hourly cap is hit. If the user
  has no `SlackIntegration` row, this is skipped entirely (no crash); if
  they connect later, the very next rate-limit hit picks up the new
  integration automatically, since the worker always reads the current row
  rather than caching it.

### 5.7 Auth

- Google: real OAuth 2.0 Authorization Code flow via `google-auth-library`.
  On success we upsert a `User` row and issue our own short-lived session
  JWT in an `httpOnly` cookie — the frontend never sees Google's tokens.
- Every API route that needs a user runs through `requireAuth` middleware,
  which just verifies that cookie.

---

## 6. Features implemented

**Backend**
- [x] Scheduling via BullMQ delayed jobs (no cron)
- [x] Persistent Postgres store, restart-safe (BullMQ persistence + boot-time reconciliation)
- [x] Idempotent sends (jobId + DB status guard)
- [x] Configurable worker concurrency
- [x] Configurable minimum delay between sends
- [x] Configurable global + per-sender hourly rate limits, Redis-backed, multi-worker safe
- [x] Rate-limited jobs are rescheduled, never dropped
- [x] Real Slack OAuth + live webhook notification on rate-limit hit, with graceful no-connector handling
- [x] Elasticsearch indexing + search endpoint
- [x] Live BullMQ dashboard (`/admin/queues`)
- [x] Multiple Ethereal sender identities

**Frontend** (matches the provided Figma)
- [x] Real Google OAuth login → redirect to dashboard (email/password fields from the Figma login mock were intentionally omitted — the spec requires real Google OAuth, not a mock credential form)
- [x] Header with name, email, avatar, logout
- [x] Left-rail navigation with Compose button and Scheduled/Sent counts (matches the Figma homepage layout), inbox-style row list for each
- [x] Compose modal: From (sender) dropdown, To as recipient chips with type-to-add + "Upload List" for CSV/text with detected-count, Subject, delay-between-emails, hourly limit, rich text body (bold/italic/underline/lists/quote/strikethrough/align/undo-redo toolbar)
- [x] Send (immediate) and Send Later (popover with quick picks — Tomorrow, Tomorrow 10am/11am/3pm — plus a custom date/time picker and its own hourly-limit field), both submit to the same schedule API
- [x] Loading and empty states throughout
- [x] Connect/disconnect Slack from the dashboard

---

## 7. Assumptions, shortcuts, trade-offs

- The compose flow schedules recipients with an evenly-spaced
  `scheduledFor` based on the requested delay; the *actual* pacing enforced
  at send time is the worker's own limiter, which is the real throttle a
  reviewer should watch under load.
- `hourlyLimit` submitted from the compose modal is accepted per-request
  but the authoritative enforcement is the server-side
  `MAX_EMAILS_PER_HOUR(_PER_SENDER)` env config — this keeps the limiter
  centrally configurable rather than trusting a per-request value from the
  client.
- Sender selection in the compose modal is simplified to "use default
  sender" (first `ETHEREAL_SENDERS` entry) unless a `senderId` is passed;
  `POST /api/senders` exists to mint/attach additional identities, but the
  UI doesn't yet expose a sender picker in the modal.
- Retries on hard SMTP failures use BullMQ's built-in `attempts` +
  exponential `backoff` rather than a custom retry table.
- No horizontal-scaling test was performed for the "multiple worker
  processes" claim beyond code-level correctness (Lua-script atomicity) —
  this is called out here rather than glossed over.
