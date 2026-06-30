# CI/CD Pipeline Design Spec

**Goal:** Add Railway preview environments, automated Supabase migration runs, and Playwright smoke tests on CI so every PR is validated end-to-end before merge.

**Architecture:** Two Supabase projects (staging + production). PRs trigger migrations against staging and spin up a Railway preview environment. When Railway signals the preview is live, Playwright smoke tests run against it. Merging to main runs migrations against production; Railway auto-deploys production.

**Stack:** GitHub Actions, Railway (existing), Supabase CLI (`supabase/setup-cli`), Playwright (existing).

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          PR OPENED                                  │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
         ┌─────────────────────┼───────────────────────┐
         ▼                     ▼                       ▼
   ┌───────────┐       ┌─────────────┐       ┌─────────────────────┐
   │   Test    │       │  Lint +     │       │  Migrate staging DB │
   │ (Vitest)  │       │   Build     │       │  supabase/setup-cli │
   └───────────┘       └─────────────┘       └──────────┬──────────┘
                                                         │
                                              Railway sees PR →
                                              spins up preview env
                                                         │
                                              deployment_status:
                                                   success
                                                         │
                                                         ▼
                                             ┌───────────────────────┐
                                             │   Playwright E2E      │
                                             │   smoke tests         │
                                             │   URL: preview env    │
                                             │   DB:  staging        │
                                             └───────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                        MERGE TO MAIN                                │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
         ┌─────────────────────┴───────────────────────┐
         ▼                                             ▼
┌─────────────────────┐                   ┌────────────────────────┐
│  Migrate prod DB    │                   │  Railway auto-deploys  │
│  supabase/setup-cli │                   │  production            │
└─────────────────────┘                   └────────────────────────┘
```

### Environment Map

```
GitHub Secrets
├── STAGING_SUPABASE_URL
├── STAGING_SUPABASE_ANON_KEY
├── STAGING_SUPABASE_SERVICE_KEY    ← global-setup.ts auth bypass
├── STAGING_SUPABASE_PROJECT_REF    ← supabase db push target
├── STAGING_SUPABASE_DB_PASSWORD    ← supabase db push auth
├── PROD_SUPABASE_URL
├── PROD_SUPABASE_ANON_KEY
├── PROD_SUPABASE_SERVICE_KEY
├── PROD_SUPABASE_PROJECT_REF
├── PROD_SUPABASE_DB_PASSWORD
└── SUPABASE_ACCESS_TOKEN           ← personal access token for CLI

Railway
├── Production service   ←── deploys from main
└── PR preview services  ←── auto per PR, torn down on close

Supabase
├── chat-app-production  ←── prod Railway only, never touched by CI
└── chat-app-staging     ←── CI + preview envs + Playwright test users
```

### Workflow Files

```
.github/workflows/
├── ci.yml       (exists) — unit tests, lint, build — no changes needed
├── migrate.yml  (new)    — supabase db push; runs on PR open/update
│                           and on merge to main (different project ref)
└── e2e.yml      (new)    — Playwright smoke tests; triggered by
                            deployment_status: success from Railway
```

---

## Component Details

### migrate.yml

Runs in two contexts via a single job with conditional env vars:

- **On PR** — targets staging project ref + staging DB password
- **On push to main** — targets production project ref + production DB password

Steps:
1. Checkout
2. `supabase/setup-cli@v1` installs CLI
3. `supabase link --project-ref $PROJECT_REF` links to correct project
4. `supabase db push` applies any new migrations

**First-run prerequisite (one-time, done before merging migrate.yml):**
The 8 existing migrations were applied via the Supabase dashboard, not the CLI. The CLI's `schema_migrations` tracking table will not know about them. Before the first CI run, execute:

```
supabase migration repair --status applied 001 002 003 004 005 006 007 008
```

against both staging and production projects. This marks all existing migrations as already applied so the CLI does not re-run them.

### e2e.yml

Triggered by `deployment_status` event (not `pull_request`). Railway posts this event after the preview environment is live.

```
on:
  deployment_status: {}
```

Runs only when `github.event.deployment_status.state == 'success'`.

The preview URL is available at `github.event.deployment_status.target_url` — passed to Playwright via `BASE_URL` env var, overriding `playwright.config.ts`'s `baseURL`.

Steps:
1. Checkout
2. Setup Node + install deps
3. Install Playwright browsers (`npx playwright install chromium --with-deps`)
4. Run `npx playwright test` with:
   - `BASE_URL` = `${{ github.event.deployment_status.target_url }}`
   - `NEXT_PUBLIC_SUPABASE_URL` = `STAGING_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `STAGING_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_KEY` = `STAGING_SUPABASE_SERVICE_KEY`

### global-setup.ts (update)

Currently hardcodes `http://localhost:3000` as the Supabase target and uses raw fetch. Needs two updates:

1. Read `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_KEY` from env vars instead of hardcoding — so it targets staging when run in CI.
2. Read `BASE_URL` from env for any app-level setup steps.

The test users (`playwright-test-a@mailinator.com`, `playwright-test-b@mailinator.com`) will be created in the staging Supabase project, not production. The idempotent signup logic already handles "user already exists" gracefully.

### playwright.config.ts (minor update)

`baseURL` should fall back to env var:

```ts
baseURL: process.env.BASE_URL ?? 'http://localhost:3000'
```

---

## Supabase Staging Project Setup (one-time manual steps)

1. Create a new Supabase project named `chat-app-staging`
2. Copy its URL, anon key, service key, project ref, and DB password into GitHub Secrets
3. Run migration repair on staging (marks all 8 existing migrations as applied)
4. Run migration repair on production (same)
5. Disable email confirmation on staging (same setting as production — required for Playwright signup flow)

---

## Decisions Log

| # | Question | Chosen | Why | Rejected |
|---|---|---|---|---|
| 1 | Supabase environments | Two separate projects (staging + production) | Preview envs and CI must not touch production data | Single project — test inserts go into real user data |
| 2 | Staging DB persistence | Persistent staging project | Free tier allows 2 projects; simpler; no cross-PR interference at current team size | Supabase branching (ephemeral per PR) — paid feature, overkill for solo/small team |
| 3 | Documentation strategy | ADR + CLAUDE.md Environments section + skill after second project | ADR captures why; CLAUDE.md is the operational reference; skill should wait until pattern is proven reusable | Writing a skill immediately — too specific to generalize |
| 4 | Migration tooling | `supabase/setup-cli` GitHub Action + `supabase db push` | Official Supabase-supported Action; handles CLI install and auth cleanly | Manual curl against Supabase Management API — fragile, no official support |
| 5 | Migration history repair | One-time `supabase migration repair` before first CI push | 8 existing migrations applied via dashboard, not CLI. Must mark them applied or CI re-runs them and fails | Ignoring history — causes CI failure on first run |
| 6 | Playwright test scope | Smoke tests only for now | Fast, low flake risk, < 2 min. Full regression suite deferred until capacity exists | Full regression suite — expensive to build and maintain at current stage |
| 7 | Staging data seeding | Idempotent global-setup.ts pointing at staging env vars | Already written; creates test users if missing, seeds fresh message per run | Per-test data creation — overkill for current suite size |
| 8 | GitHub secret naming | `STAGING_SUPABASE_*` and `PROD_SUPABASE_*` prefixes | Clear which environment a secret belongs to; prevents misconfiguration | Unprefixed names — ambiguous |
| 9 | Railway preview URL | `${{ github.event.deployment_status.target_url }}` | Railway posts the preview URL in the deployment_status event; no hardcoding needed | Hardcoding URL pattern — breaks if Railway changes naming |

---

## Rejected Proposals

**Supabase branching:** Ephemeral DB per PR. True isolation. Worth revisiting if concurrent PRs cause test interference. Costs ~$10/month.

**Ephemeral test data via RPC seed function:** Creates and tears down test data per run. Deferred — persistent staging users are simpler to start with.

**Running E2E on `pull_request` event:** Would require the app to be deployed first anyway. The `deployment_status` trigger is the correct pattern — it fires exactly when the preview is live, avoiding race conditions.

