# Chat App — Project Reviewer & Interview Guide

> **Living document.** Updated as new concepts are added or lessons are learned.
> Last updated: 2026-07-07

---

## What We Built

A real-time chat web app built to simulate how a professional team ships software — not just to have a finished product, but to practice the full workflow: designing before coding, writing tests before implementing, reviewing before merging.

**Core features:**
- User registration and login
- 3-panel layout: contacts sidebar (with online indicators), conversation list, chat panel
- Messages appear in real-time without refreshing the page
- Unread message bold indicator that persists across page refreshes
- Username-based URLs (`/chat/alice`) with a settings page to change your username
- Link preview cards — URLs in messages fetch Open Graph metadata asynchronously via a BullMQ worker and render below the message bubble
- CI/CD pipeline: automated tests run on every pull request, including end-to-end smoke tests against a live preview environment

**Tech stack:**
| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) |
| Auth + DB + Realtime | Supabase |
| Styling | Tailwind CSS v4 |
| Testing | Vitest (unit), Playwright (E2E) |
| Hosting | Railway (production + PR previews) |
| CI/CD | GitHub Actions |
| Formatter | Prettier (auto-runs on every file save) |
| Queue | BullMQ + Redis (Railway-native) |
| Background worker | Node.js service on Railway (same repo, `npm run worker`) |

---

## Technical Concepts

### 1. Supabase Realtime — Two Channels for One Use Case

**Simple version:** Supabase can notify your app when a database row changes — like a live feed. But each "listener" can only watch for one specific condition. To watch for messages involving you (either as sender OR receiver), you need two listeners — one watching each condition.

**The longer version:** Supabase Realtime filters only support simple equality checks, one per channel. SQL OR conditions aren't supported. So to capture every message a user is part of, we opened two subscriptions:
- One filtered to `sender_id = me`
- One filtered to `receiver_id = me`

Both subscriptions call the same handler function, which updates the conversation list when any matching message arrives.

**Interview talking point:** "Supabase Realtime's filter syntax only supports simple equality — you can't do OR conditions. When I needed to subscribe to all messages involving a user (as sender or receiver), I had to open two channels. That also meant two teardown paths in cleanup."

---

### 2. PostgrestBuilder Lazy Evaluation (The Silent Bug)

**Simple version:** Calling a Supabase function doesn't actually run it. It's like picking up a TV remote and pressing a button in your head — nothing happens until you physically press it. In code, you have to add `.then()` or `await` to actually send the request. We forgot to do that, so the database was never updated, and every page refresh showed all conversations as bold (unread) — because the "mark as read" call was never actually made.

**Why it's sneaky:** There's no error. The code looks like it runs. TypeScript doesn't warn you. The only way to catch it is to check whether the database was actually updated.

**The fix:** Add `.then()` to the call. One line. Three sessions to find.

**Interview talking point:** "I tracked down a bug where a Supabase RPC appeared to run fine but the database was never actually updated. Root cause: Supabase's query builder is lazy — it only fires the HTTP request when the promise is consumed. A call without `.then()` is silently a no-op. There's no error — it just does nothing."

---

### 3. React Refs in Dependency Arrays

**Simple version:** `useEffect` has a watchlist. When anything on that list changes, the effect re-runs from scratch. The problem: our `profiles` list was on the watchlist. Every time the user navigated to a new conversation, the page sent a fresh copy of the same profiles — and even though the data was identical, React saw a new array reference and re-ran the effect, wiping out any "read" state the user had accumulated.

**The fix:** Move the profiles off the watchlist. Use a "ref" instead — a ref is like a notepad you can read from inside the effect, but nothing watches it for changes. The effect only runs when it's supposed to, and it reads the latest profiles from the notepad whenever it needs them.

**Why this happens in Next.js specifically:** The layout that passes profiles to the component is a Server Component — it re-runs on every page navigation because it needs to check auth cookies. That produces a new array object each time, even when the data hasn't changed.

**Interview talking point:** "Next.js Server Components re-render on every navigation, which means every page switch sends a new array reference as a prop — even when the data is identical. That reference in a `useEffect` dep array caused the effect to re-run on every navigation and reset in-memory state. The fix was to store the array in a ref: you get stable access to the current value without triggering the effect."

---

### 4. Supabase RLS (Row-Level Security)

**Simple version:** RLS is like a bouncer inside the database. Every time someone tries to read or write a row, the bouncer checks: "Is this person allowed to do this?" The rules are written in SQL and run automatically — you don't have to add permission checks in your app code.

**What we set up:**
- You can only read messages you sent or received
- You can only insert messages where you're the sender
- Nobody can directly update message content

**The problem that created:** Receivers need to update a `read_at` timestamp to mark messages as read. But if we allowed UPDATE on messages for receivers, they could also edit the message content — which we don't want.

**The solution:** A "security-definer" database function. This is a function that runs with special elevated permissions, but the function's own code is narrow and controlled — it only updates `read_at`, and only on messages sent to the person calling it. Think of it like a locked vending machine: you can press the button, but you can only get what's in slot B, not reach in and grab anything.

**Interview talking point:** "RLS is powerful but creates a constraint: if you need a user to update a field they don't own, you can't just open up UPDATE because that lets them touch everything. The solution is a security-definer database function — it runs with elevated privileges but contains its own business logic to restrict what it actually does. It's the database equivalent of a narrow API endpoint."

---

### 5. Supabase Realtime Channel Cleanup (React Strict Mode)

**Simple version:** In development, React runs your setup code twice in a row to catch bugs. It sets up, tears down, then sets up again. The problem: tearing down a Supabase channel connection is slow (async). The second setup started before the first teardown finished — React found the channel still active and threw an error.

**The fix:** Use a faster, synchronous teardown method that isn't in the official docs. It requires reaching into the Supabase SDK's internals. We recorded it in an ADR so nobody has to rediscover it.

**Why this only happens in development:** React Strict Mode's double-invoke only runs in dev. So this error never appears in production — which makes it easy to ignore. But fixing it properly means your cleanup code is genuinely correct, not just passing by luck.

**Interview talking point:** "React Strict Mode is designed to reveal cleanup bugs, and it caught a real one: Supabase's removeChannel is async, so channels weren't fully removed before the second mount tried to subscribe again. The fix required reaching into an internal method of the realtime client. We recorded it in an ADR so the solution doesn't have to be rediscovered."

---

### 6. Next.js 16 Breaking Change — proxy.ts

**Simple version:** Next.js 16 renamed a core file. The old name was `middleware.ts`. The new name is `proxy.ts`. If you use the old name, the file is completely ignored — no error, no warning, just broken behavior. Every tutorial, Stack Overflow answer, and AI assistant still refers to the old name.

**Why it matters:** This is a case where the official documentation for the version you're running is the only reliable source. Training data, blog posts, and examples are all behind.

**Interview talking point:** "This project runs on Next.js 16 which has a breaking rename — middleware is now called proxy.ts. I ran into cases where AI-generated code and docs assumed the old convention. It's a good example of why you have to read the actual framework docs for the version you're on, not rely on generic training data."

---

### 7. CI/CD Pipeline with Two Supabase Environments

**Simple version:** Before any code reaches real users, it goes through a series of automated checks. Think of it like a factory assembly line with quality gates — the product can't move to the next station until it passes the check at the current one.

```
PR opened
  ├── Unit tests (Vitest)
  ├── Lint + build check
  └── Database migrations applied to staging
        ↓
   Railway spins up a temporary preview environment for this PR
        ↓
   Railway tells GitHub "the preview is live at this URL"
        ↓
   Playwright runs smoke tests against that preview URL

Merge to main
  ├── Database migrations applied to production
  └── Railway deploys production
```

**Why two Supabase projects (staging + production)?** Test users and fake data must never touch the production database. Even with RLS (which restricts what each user can see), test data would still exist in the same database as real users. Separate projects means complete isolation.

**Why use `deployment_status` instead of `pull_request` to trigger E2E tests?** The app has to be deployed before we can test it. If we triggered tests on PR open, the preview environment might not be ready yet. `deployment_status` is Railway telling GitHub "I'm done, the app is live" — so we know it's ready before the tests start.

**Interview talking point:** "A pull_request trigger would need to poll for the deployment URL or use a fixed delay. The deployment_status event is Railway telling GitHub 'the preview is live at this URL' — you get the URL in the event payload and can start E2E tests immediately. No race condition, no hardcoded URL."

---

### 8. Link Preview Pipeline — Async Background Queue

**Simple version:** When you send a message with a URL, the app doesn't wait for the link preview to load before delivering the message. Instead, it hands the URL to a background worker — "go fetch this, I'll carry on" — and the preview appears a few seconds later when the worker finishes.

**The three-part pipeline:**
1. **Webhook** — Supabase fires an HTTP request to the Next.js app the moment a message is inserted. The app reads the URL from the message, drops a job into a Redis queue, and immediately responds.
2. **Worker** — A separate Node.js process (running as its own Railway service) picks the job from the queue, fetches the URL's HTML, parses the Open Graph metadata (`og:title`, `og:description`, `og:image`), and writes it to a `message_metadata` table.
3. **Realtime** — The client is subscribed to `message_metadata` inserts. When the worker writes the row, Supabase pushes it to the browser, and the preview card renders.

**Why the message is never delayed:** the message is inserted into Supabase directly by the client. It's already delivered before the webhook even fires. The preview is purely additive — if it fails, the message is unaffected.

**Interview talking point:** "The link preview is an async side-effect of sending a message, not part of the send path. Decoupling the two via a job queue means the message is never held waiting for an external HTTP fetch. The preview appears when it's ready — or not at all, gracefully."

---

### 9. BullMQ Job Queue — States, Retries, and Idempotency

**Simple version:** BullMQ is a queue library that manages jobs the way a post office manages packages — it tracks each one's status, retries delivery if something fails, and keeps a record of packages that couldn't be delivered.

**Job state machine:**

```
waiting → active → completed
              ↓ (fail, retries left)
          waiting (exponential backoff)
              ↓ (fail, no retries)
           failed (dead-letter queue)
```

**Exponential backoff:** instead of retrying immediately (which hammers a failing server), each retry waits longer: 2s, then 4s. By attempt 3, a flaky URL has had time to recover.

**Two-layer idempotency:** the webhook can fire twice for the same message (Supabase uses at-least-once delivery). We handle this at two layers:
1. **BullMQ job ID** = `link-preview:${messageId}:${url}` — BullMQ rejects a second job with the same ID, so the worker never processes a duplicate
2. **DB upsert with `onConflict: 'message_id,url'`** — if a duplicate job does reach the worker, the DB write is a safe overwrite, not a duplicate row. Without naming the correct unique constraint in `onConflict`, PostgREST falls back to conflicting on the primary key UUID — finds no match — and inserts a new row, which then hits the real unique constraint and throws.

**Interview talking point:** "Idempotency is two layers: BullMQ's job ID deduplication prevents the worker from running twice, and the upsert's `onConflict` clause ensures the DB write is safe even if a duplicate gets through. The specific bug: omitting `onConflict: 'message_id,url'` makes PostgREST conflict on the PK instead of the business key — a subtle distinction that only surfaces on a retry."

---

### 10. SSRF — Server-Side Request Forgery

**Simple version:** If your server fetches URLs that users provide, an attacker can give you an internal URL — `http://169.254.169.254/metadata` — and your server, running inside a cloud datacenter, will fetch it happily. That address is the AWS EC2/GCP metadata service, which returns cloud credentials. You've just leaked your own infrastructure.

**Our guard (`isPrivateUrl`):** before fetching any URL, we check whether the hostname resolves to a private address range (RFC 1918: `10.x`, `172.16–31.x`, `192.168.x`), loopback (`127.0.0.1`, `localhost`), or cloud metadata endpoints. If so, the job throws immediately — no fetch attempted.

**What it doesn't cover:** DNS rebinding — an attacker registers a public domain that briefly resolves to a public IP, passes our check, then switches to a private IP by the time we fetch. Full protection requires fetching the resolved IP and re-checking. We noted this limitation but accepted it per spec scope.

**Interview talking point:** "Any server that fetches user-provided URLs is SSRF-vulnerable by default. The minimum fix is a denylist of private IP ranges and cloud metadata hostnames. The harder problem is DNS rebinding — you'd need to resolve the hostname yourself, check the IP, then fetch using that IP. We implemented the denylist and documented the DNS rebinding gap."

---

### 11. Worker as a Railway Service (Not a CI Process)

**Simple version:** We initially ran the link preview worker as a background process inside the GitHub Actions CI job, alongside the Playwright tests. It seemed to work locally — but in CI it never processed a single job, and we couldn't figure out why at first.

**Root cause:** Each Railway PR environment has its own Redis instance. The Railway app (running on Railway) connects to Railway's Redis. The CI worker (running on GitHub Actions) was connecting to a static `STAGING_REDIS_URL` secret — a completely different Redis. Jobs enqueued by Railway sat in one queue; our CI worker drained a different one entirely.

**The fix:** deploy the worker as a second Railway service in the same project. Railway auto-injects `REDIS_URL` into all services in the same environment — they share the same Redis by definition. Every PR environment gets its own worker and Redis pair automatically, with no manual secret updates per PR.

**The broader rule:** if a worker shares state with a deployed service, it must run in the same deployment environment — not on CI. CI is for testing the deployed system from outside, not for being part of it.

**Interview talking point:** "We were running the worker in CI and wondering why it never processed jobs. The answer: Railway gives each PR environment its own Redis, but CI has a static secret pointing at a different instance. The worker and the app were never talking to the same queue. The correct architecture is to deploy the worker as a Railway service — they share Redis automatically by living in the same environment."

---

### 12. Supabase Publication for Realtime

**Simple version:** Supabase Realtime has a whitelist of tables it broadcasts changes for. If a table isn't on the whitelist, subscriptions to it receive nothing — no error, just complete silence. We wrote a working subscription to the `profiles` table, it produced zero events, and it took a while to figure out why. The fix was one SQL line: add `profiles` to the whitelist.

**The whitelist is called a "publication"** — it's a PostgreSQL concept. Tables have to be explicitly added after creation. New tables are not included automatically.

**Interview talking point:** "Supabase Realtime is publication-based — you have to explicitly opt tables in. When a subscription receives no events and you can't figure out why, check whether the table is in the `supabase_realtime` publication. It's an easy thing to miss and produces no error — just silent nothing."

---

### 9. Database Migrations — What They Are and What Ours Do

**Simple version:** A migration is a numbered instruction card for your database. Card 001 says "create the users table." Card 002 says "create the messages table." They always run in order, and the Supabase CLI keeps a log of which cards have already been applied — so running the same migration twice is safe, it just checks the log and skips the ones already done.

**Think of it this way:** Your database structure is like a filing cabinet. Migrations are the written instructions for building it — add this drawer, add this folder, add this label. If you hand a fresh cabinet and the full stack of cards to any machine (local, staging, production, a teammate's laptop), it ends up with the exact same cabinet. That's the point.

**The tracking table:** Supabase stores applied migration names in a `supabase_migrations` table in your database. When you run `supabase db push`, it compares the files in `supabase/migrations/` against that table and only runs the ones that aren't already recorded.

**What each migration in this project does:**

| File | What it does |
|---|---|
| `001_create_profiles.sql` | Creates the `profiles` table — one row per auth user (display name, avatar URL) |
| `002_create_messages.sql` | Creates the `messages` table — the chat messages themselves (sender, receiver, content, timestamps) |
| `003_rls_policies.sql` | Turns on Row Level Security and adds the rules: you can only read messages you sent or received; you can only insert where you're the sender |
| `004_profile_trigger.sql` | Adds a PostgreSQL trigger that auto-creates a profile row the moment a new user signs up — app code never has to do it manually |
| `005_mark_messages_read_rpc.sql` | Creates the `mark_messages_read` security-definer function — the only way a receiver can update `read_at` without being able to touch message content (see RLS section) |
| `006_mark_messages_read_auth_guard.sql` | Adds an auth check to that function so anonymous callers can't invoke it |
| `007_add_username_to_profiles.sql` | Adds the `username` column and a trigger that auto-generates it from the email address (e.g. `alice@example.com` → `alice`) |
| `008_profiles_realtime.sql` | Adds `profiles` to the Supabase Realtime publication so live updates on profile changes broadcast to subscribed clients |
| `009_message_metadata.sql` | Creates the `message_metadata` table (OG preview fields, status, unique constraint on `message_id + url`), `moddatetime` trigger, RLS SELECT policy (participants only), and adds the table to the Realtime publication |

**Why both staging and production run all 9:** The CI pipeline runs `supabase db push` against staging on every PR, then against production on merge to main. Same migration files, two separate Postgres databases — both always in sync with the code. If a migration is broken, it fails in staging before it can touch production.

**Interview talking point:** "Every database change is a versioned, numbered migration file. Nothing is done through the dashboard — because a dashboard change only applies to one environment and leaves no record. Migrations mean any environment can be reconstructed from scratch by running the files in order."

---

### 10. Migration History Repair

**Simple version:** A "migration" is a recorded change to your database structure — things like "add a users table" or "add a username column." The Supabase CLI keeps a log of every migration it has applied. If you made database changes through the Supabase website (dashboard) instead of through the CLI, the CLI's log is blank — it thinks nothing has been done, and it will try to run everything again from scratch.

**What we did:** Used `supabase migration repair` to tell the CLI "these migrations are already done — just write them in your log without re-running them." This was a one-time fix before the first CI run.

**Interview talking point:** "When you adopt the Supabase CLI after starting a project with the dashboard, you have to reconcile the migration history. The CLI's repair command lets you mark migrations as applied or reverted without running them — it just updates the tracking table. One-time operation before the first CI run."

---

### 13. Railway Cloudflare Rate Limiting — The `?queryName=` Fix

**Simple version:** When our CI pipeline tries to set Railway environment variables via the Railway API, it gets back a 403 "Forbidden" error — even with a valid token. The culprit isn't the token. It's Cloudflare, which protects Railway's API and applies an unusually strict rate limit to any request that's missing a specific query parameter.

**The specific rule:** Railway's GraphQL API at `backboard.railway.app/graphql/v2` uses Cloudflare. Any request sent *without* a `?queryName=<something>` query parameter hits a 10 requests-per-second limit. GitHub Actions runs CI for thousands of projects, all from a shared pool of IP addresses — which means those IPs frequently exceed 10 RPS on Railway's API, triggering temporary IP bans that look like this: `HTTP 403: error code: 1010`.

**The fix:** append `?queryName=<opName>` to every Railway GraphQL URL. This opts into a more generous rate limit (50 RPS). The operation name can be anything descriptive — it's primarily a Cloudflare routing hint, not a GraphQL protocol requirement.

```python
# Before: hits 10 RPS limit, shares a ban with every other CI job
f'https://backboard.railway.app/graphql/v2'

# After: opts into 50 RPS limit, not affected by other CI jobs' hits
f'https://backboard.railway.app/graphql/v2?queryName={op_name}'
```

**Why it's hard to debug:** The 403 error looks like an authentication problem. You check the token — it's valid. You check the secret — correct. You try again — still 403. The IP ban lasts up to 24 hours, so retrying immediately doesn't help. Nothing in the error response tells you it's a rate limit; `error code: 1010` is a Cloudflare-specific code documented in their community forums, not in Railway's docs.

**Interview talking point:** "We had a CI step that called the Railway GraphQL API and kept getting 403, even with a valid token. After researching the error code, I found that Railway's Cloudflare config applies a 10 RPS rate limit to requests without a specific query parameter — and shared GitHub Actions IPs exceed this all the time. The fix was a single query parameter: `?queryName=<opName>`. It opts into a higher limit and cost us nothing to add."

---

### 11. PresenceContext Singleton

**Simple version:** In the browser, there's only one Supabase client. When you open a channel by name, Supabase remembers it. If three different components all try to open the same channel and subscribe to it, Supabase sees it as one channel being subscribed to three times — which it rejects after the first time with an error.

**The fix:** Have exactly one component own the channel and manage the subscription. Everyone else reads the data from that component via React Context. This is called the "singleton pattern" — making sure something only exists once, and sharing access to that one instance.

**Interview talking point:** "Supabase's browser client is a singleton, and channels are reused by topic. Three components subscribing to the same presence channel isn't three subscriptions — it's one channel with three attempts to add callbacks after it's already subscribed. The fix is a singleton pattern at the React layer: one context owns the channel, everyone else reads state from that context."

---

## Engineering Practices

### Feature Development Workflow

Every feature followed this sequence, without exception — even small ones:

1. **Branch** — create a new git branch; never write code directly on `main`
2. **Brainstorm** — design the feature first; check that it matches the existing app's patterns before drawing any mockups
3. **Plan** — write out exactly what files to change and what code to write, before touching anything
4. **Implement** — use subagent-driven development to execute the plan (see below)
5. **Test** — all logic must have passing unit tests before the PR opens
6. **Security review** — scan the diff for vulnerabilities before pushing
7. **Finish** — open a PR; never push directly to `main`

**Interview talking point:** "I treat personal projects like production work. Every feature starts with a branch and a written plan. Nothing merges without tests and a security review. The habits are the point."

---

### ADR (Architecture Decision Records)

**Simple version:** When you make a significant technical decision, write a short document explaining what you chose, why, and what alternatives you rejected. Future you (or a teammate) will eventually ask "why is this built this way?" — the ADR is the answer.

**The rejected alternatives section is the most important part.** It documents what you thought about, not just what you picked. Without it, the same alternatives get re-proposed and re-debated in every future session.

**ADRs written in this project:**
| ADR | Decision |
|---|---|
| ADR-001 | PresenceContext singleton (not per-component subscriptions) |
| ADR-002 | Supabase dual client pattern (browser vs server) |
| ADR-003 | Next.js 16 proxy.ts (not middleware.ts) |
| ADR-004 | Security-definer RPC for mark_messages_read |
| ADR-005 | Realtime cleanup via teardown() + _remove() |
| ADR-006 | CI/CD two-environment pipeline |

**Interview talking point:** "I write ADRs for any decision where a future developer might ask 'why didn't you just do X?' and the answer isn't obvious from the code. The rejected alternatives section is especially useful — it documents what you thought about, not just what you chose."

---

### Test-Driven Development (TDD)

**Simple version:** Write the test before the code. The test should fail first (because the code doesn't exist yet). Then write the minimum code to make it pass. This order matters — a test that starts failing and then passes is proof that the code actually does the thing the test describes.

**Why writing the test after is worse:** When you write a test after the implementation, you're often just describing what the code does, not what it should do. The test passes immediately and might never catch a bug.

**Example from this project:** Before fixing the lazy evaluation bug, a test was written that mocked the Supabase builder to only resolve when `.then()` was called. The test failed (proving the bug existed). Then `.then()` was added. The test passed. The test now permanently guards against that bug regressing.

**Interview talking point:** "TDD on this project caught real bugs. The mock for the PostgrestBuilder lazy evaluation was designed to fail if the RPC call didn't include `.then()`. That test documented the contract — 'this must produce an HTTP request' — not just the implementation."

---

### Retros (Post-Incident Reviews)

**Simple version:** After a serious bug is fixed, write a short document: what broke, why it broke, what the fix was, and what process change prevents it from happening again. The goal isn't blame — it's finding the systemic issue that let the bug slip through, and patching the process.

**Example from this project:** A required retro was accidentally skipped because we hit a session boundary between filing the bug and fixing it. The retro obligation just... disappeared. The fix: the bug workflow was updated to save a memory note about the pending retro at filing time, not fix time. The process was patched so that particular failure mode can't happen again.

**Interview talking point:** "A retro's value is the process change, not the documentation. A retro obligation slipped through a session boundary. The fix was to record it at filing time — so the obligation survives if the session ends before the fix lands."

---

### Code Quality Baseline (Shift-Left)

**Simple version:** Catching a bug at commit time costs almost nothing. Catching it in a code review costs a full review cycle. Catching it in production costs users. "Shift-left" means pushing the quality gate as early in the chain as possible — ideally before the code ever reaches the reviewer.

**This project's three-layer chain:**
1. **Pre-commit (Husky + lint-staged):** ESLint auto-fixes staged files before they're committed. Developers see lint errors immediately, not after pushing.
2. **CI (GitHub Actions):** `npx tsc --noEmit` type-checks all files — including `worker/` and `tests/` that Next.js build doesn't touch. `npm audit --audit-level=high` fails CI on any high or critical CVE. These are hard CI failures — the PR cannot merge.
3. **Code review:** The human reviewer sees code that's already passed two automated gates, so review attention goes to logic and design rather than style and type errors.

**Lesson learned: `tsc --noEmit` does NOT work in lint-staged.** When lint-staged passes file arguments to `tsc`, TypeScript bypasses `tsconfig.json` entirely — no `skipLibCheck`, no path aliases (`@/`), no module resolution settings. Everything in `node_modules` shows as an error. Type checking is a full-project operation and belongs only in CI.

**Interview talking point:** "Shift-left means moving the quality gate earlier. Pre-commit catches lint. CI catches types and CVEs. Code review catches logic. Each layer checks something the previous layer can't — not the same thing three times."

---

### Security Reviews

**Simple version:** Before pushing any code, scan the diff for vulnerabilities. Common things to look for: user input being passed to redirects or SQL without validation, secrets hardcoded in files, permissions that are broader than they need to be.

**Example from this project:** The security review caught an open redirect. The login page accepted a `next` parameter to redirect users after login. We were passing that parameter directly to `redirect()` without checking it — an attacker could craft a link that redirects users to a malicious site after they log in. Fixed by validating the value starts with `/` and doesn't start with `//`.

**Interview talking point:** "The open redirect in the auth callback was caught in the review, not in production. Redirecting user-controlled values without validation is a classic OWASP finding. Running a review before every PR is a low-cost habit with real payoff."

---

## Claude Code Skills & Workflows

*This section is specifically relevant for roles that use Claude Code as part of the development workflow.*

### What Claude Code Is

Claude Code is a CLI tool (runs in your terminal) that can read files, write code, run tests, and make commits — not just answer questions. The key difference from a chatbot: it's agentic, meaning it can chain multiple steps together to complete a task without stopping to ask after every one. You tell it the goal; it figures out the steps.

---

### Subagent-Driven Development

**Simple version:** Instead of asking Claude to implement an entire feature in one go (which leads to long, wandering sessions and lower quality), you break the feature into tasks and dispatch a fresh Claude instance per task. Each fresh instance has no baggage from previous tasks — just the one brief it needs. After each task, a separate reviewer Claude checks the work. If there are issues, a fixer Claude addresses them. A final reviewer looks at the whole branch before the PR opens.

**Why this is better than one long session:**
- Fresh context per task means no confusion from 2 hours of earlier work
- Two separate review passes (did it build the right thing? was it built well?)
- The final whole-branch reviewer catches things the per-task reviewers missed — in this project it caught a missing production deployment filter and a deleted comment

**Interview talking point:** "Subagent-driven development shifts your role from implementer to coordinator. You write the spec, define the interfaces, review the output, decide what to fix. The AI does the repetitive work. The human stays at the design and judgment layer."

---

### Skills and Workflows Used in This Project

**Brainstorming skill:** Runs a mandatory design process before any code is written — consistency check (does this match existing patterns?), platform research, ASCII mockup, confirmed decisions. No implementation starts until all design questions are closed.

**Writing-plans skill:** Turns a design into a task-by-task implementation plan with exact file paths, complete code snippets, and a TDD sequence per task. No vague steps allowed.

**Bug skill:** Enforces systematic debugging before any code is touched. Root cause must be confirmed before a fix is proposed. For serious bugs, records the retro obligation immediately so it survives a session ending.

**Journal skill:** Appends a structured entry to `docs/journal/YYYY.md` after significant sessions. Entries must include reasoning, not just what changed. Automatically handles draft files created by interrupted sessions.

**Verification gate:** Before any PR is opened, manually run the app and test the main flow. Tests verify logic; manual testing verifies features.

---

### What to Highlight for a Claude Code Role

1. **Used systematically, not ad hoc.** Every feature followed the same workflow — brainstorm → plan → subagent-driven implementation → review → security check → PR. No shortcuts.

2. **Understand the cost model.** Subagents don't carry session history. Artifacts move as files, not pasted text (which bloats context). Models are chosen to match task complexity — cheap models for mechanical work, capable models for judgment calls.

3. **Contributed to the workflow itself.** Multiple skills and global config updated based on real failures: the journal skill (draft file handling), the bug skill (immediate retro obligation memory), and the global CLAUDE.md (Definition of Done, CI/CD standards, commit message standard, no-dummy-commit rule, concept vs. tool separation in the new project checklist).

4. **Ran the full workflow end-to-end, repeatedly.** Not just once. Every feature. That consistency is the point — it's what makes the habits stick.

---

## Bugs Worth Remembering

The bugs that took the longest to find, and what they teach:

| Bug | Root Cause | What to remember |
|---|---|---|
| Conversations always bold after refresh | `supabase.rpc(...)` without `.then()` never fires — the DB was never updated | Any Supabase call without `await` or `.then()` is a silent no-op |
| Read state wiped on every navigation | Server Component sends a new array reference on every render; that reference in a dep array re-ran the effect | Use a ref to read a value without making it a reactive dependency |
| Profile username updates never arrived | `profiles` table wasn't in the `supabase_realtime` publication | Tables must be explicitly added to the publication to receive Realtime events |
| Realtime subscription error in dev | `supabase.removeChannel()` is async — React Strict Mode's second mount starts before cleanup finishes | Use `channel.teardown() + _remove()` for synchronous cleanup |
| Open redirect in auth callback | `next` query param passed directly to `redirect()` without validation | Always validate redirect targets: starts with `/`, not `//` |
| Upsert silently succeeded despite DB error | `supabase.from(...).upsert(...)` returns `{ data, error }` — it never throws. Not destructuring `error` meant DB constraint failures were silently swallowed as job successes | Always destructure `{ error }` from Supabase writes and `if (error) throw error` |
| Preview card never appeared in E2E (CI worker connected to wrong Redis) | CI worker used a static `STAGING_REDIS_URL` secret; Railway app used its own per-environment Redis. Jobs were enqueued into Railway's Redis, worker drained a different instance | Workers that share a queue with a deployed service must run in the same deployment environment, not CI |
| `Math.random()` lint error in `useRef` | React compiler flags `Math.random()` as an impure function call during render — `useRef(...)` is evaluated at render time | Use `useId()` to generate stable unique IDs per hook instance; it's pure and React-approved |
| Upsert idempotency broken on retry | `onConflict` not specified — PostgREST conflicted on PK UUID (no match found) and issued a plain INSERT. The real unique constraint `(message_id, url)` then threw on retry | Always name the business-key constraint in `onConflict`, not just the PK |
| `tsc --noEmit` in lint-staged showed hundreds of node_modules errors | When lint-staged passes file args to `tsc`, TypeScript bypasses `tsconfig.json` entirely — no `skipLibCheck`, no path aliases. Every library's `.d.ts` file becomes a candidate for type errors | `tsc --noEmit` is a full-project command; never pass it file arguments. Put it in CI, not lint-staged |
| ESLint `react/no-children-prop` conflicts with TypeScript in test wrappers | Components that explicitly declare `children: ReactNode` in their props type require `children` in the props object passed to `React.createElement`. But ESLint says don't put children in props. | In `.tsx` test files use JSX syntax (`<Component>{children}</Component>`); in `.ts` test files, add `eslint-disable-next-line` with a comment explaining the constraint |

---

## How to Showcase This Project

A real-time chat app is a common portfolio piece. What makes this one worth talking about is *how* it was built and *what went wrong* along the way.

**Lead with the process:**
> "I deliberately treated this small personal project like production work — feature branches, architecture decision records, test-driven development, security reviews before every PR, post-incident retros. The goal was to build the habits, not just the app."

**Lead with a war story:**
> "There was a bug where conversations appeared unread after every page refresh, even after opening them. Three sessions to find. The Supabase query builder is lazy — a call without `.then()` looks fine but never fires. The fix was one line. Finding it required tracing from the UI all the way down to the database to realize it was never being updated at all."

**Lead with the AI workflow:**
> "I used Claude Code's subagent-driven development workflow throughout — fresh agent per task, reviewer agent after each one, final whole-branch review before the PR. The final reviewer caught two issues the per-task reviewers missed. That's a quality gate that's hard to enforce on solo projects without a structured workflow."

**For a Claude Code-specific role:**
> "I've run the full workflow — brainstorm, plan, subagent-driven implementation, security review — on every feature in this project. I also contributed back to the skill definitions: the bug skill and journal skill were both updated based on real failures during this project. I know the workflow well enough to debug it when it breaks."

---

*This document is updated as new features and concepts are added. Check `docs/journal/2026.md` for the most recent session's decisions and pending items.*
