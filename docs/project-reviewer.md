# Chat App — Project Reviewer & Interview Guide

> **Living document.** Updated as new concepts are added or lessons are learned.
> Last updated: 2026-06-24

---

## What We Built

A real-time chat web app built to simulate how a professional team ships software — not just to have a finished product, but to practice the full workflow: designing before coding, writing tests before implementing, reviewing before merging.

**Core features:**
- User registration and login
- 3-panel layout: contacts sidebar (with online indicators), conversation list, chat panel
- Messages appear in real-time without refreshing the page
- Unread message bold indicator that persists across page refreshes
- Username-based URLs (`/chat/alice`) with a settings page to change your username
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

### 8. Supabase Publication for Realtime

**Simple version:** Supabase Realtime has a whitelist of tables it broadcasts changes for. If a table isn't on the whitelist, subscriptions to it receive nothing — no error, just complete silence. We wrote a working subscription to the `profiles` table, it produced zero events, and it took a while to figure out why. The fix was one SQL line: add `profiles` to the whitelist.

**The whitelist is called a "publication"** — it's a PostgreSQL concept. Tables have to be explicitly added after creation. New tables are not included automatically.

**Interview talking point:** "Supabase Realtime is publication-based — you have to explicitly opt tables in. When a subscription receives no events and you can't figure out why, check whether the table is in the `supabase_realtime` publication. It's an easy thing to miss and produces no error — just silent nothing."

---

### 9. Migration History Repair

**Simple version:** A "migration" is a recorded change to your database structure — things like "add a users table" or "add a username column." The Supabase CLI keeps a log of every migration it has applied. If you made database changes through the Supabase website (dashboard) instead of through the CLI, the CLI's log is blank — it thinks nothing has been done, and it will try to run everything again from scratch.

**What we did:** Used `supabase migration repair` to tell the CLI "these migrations are already done — just write them in your log without re-running them." This was a one-time fix before the first CI run.

**Interview talking point:** "When you adopt the Supabase CLI after starting a project with the dashboard, you have to reconcile the migration history. The CLI's repair command lets you mark migrations as applied or reverted without running them — it just updates the tracking table. One-time operation before the first CI run."

---

### 10. PresenceContext Singleton

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

3. **Contributed to the workflow itself.** Two skills were updated during this project based on real failures: the journal skill (draft file handling after orphaned drafts accumulated), and the bug skill (immediate memory of retro obligation after one slipped through a session boundary).

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
