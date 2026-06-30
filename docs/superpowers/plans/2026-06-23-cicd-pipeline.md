# CI/CD Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Railway PR preview environments, automated Supabase migrations on CI, and Playwright smoke tests triggered by Railway's deployment webhook so every PR is validated end-to-end before merge.

**Architecture:** Two Supabase projects (staging + production). On PR open/update, migrations run against staging and Railway auto-spins a preview environment. When Railway signals the preview is live via `deployment_status`, Playwright smoke tests run against it. On merge to main, migrations run against production and Railway auto-deploys.

**Tech Stack:** GitHub Actions, Railway (existing deployment), Supabase CLI (`supabase/setup-cli` Action), Playwright (existing).

## Global Constraints

- Never run migrations against production manually — CI is the only path after this is set up
- Playwright test users live in staging Supabase only — never production
- GitHub Secret names follow `STAGING_SUPABASE_*` and `PROD_SUPABASE_*` prefixes exactly
- Tasks 1 and 2 are manual infrastructure steps with no commits — must be completed before any workflow files are merged

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `.github/workflows/migrate.yml` | Create | Run `supabase db push` on PR (→ staging) and push to main (→ production) |
| `.github/workflows/e2e.yml` | Create | Run Playwright smoke tests when Railway signals preview is live |
| `playwright.config.ts` | Modify | Read `BASE_URL` from env; skip local dev server when `BASE_URL` is set |
| `tests/e2e/global-setup.ts` | Modify | Read Supabase URL and anon key from env vars instead of hardcoded values |
| `CLAUDE.md` | Modify | Add Environments section documenting the two-project setup |
| `docs/adr/ADR-006-cicd-pipeline.md` | Create | Record the architecture decision for the two-environment pipeline |

---

## Task 1: Create Supabase staging project and configure GitHub Secrets

**Manual infrastructure — no code changes, no commit.**

- [ ] **Step 1: Create the staging Supabase project**

  Go to [supabase.com/dashboard](https://supabase.com/dashboard) → New project.
  - Name: `chat-app-staging`
  - Organization: same as your production project
  - Database password: generate a strong one and **save it immediately** — you cannot retrieve it later
  - Region: same region as production

  Wait for the project to finish provisioning (~2 minutes).

- [ ] **Step 2: Disable email confirmation on staging**

  In the staging project dashboard: Authentication → Providers → Email → disable "Confirm email".
  This is required for the Playwright `signUp` flow to return an access token immediately (same as production).

- [ ] **Step 3: Collect staging credentials**

  From the staging project dashboard, collect these values:

  | Secret name | Where to find it |
  |---|---|
  | `STAGING_SUPABASE_URL` | Project Settings → API → Project URL |
  | `STAGING_SUPABASE_ANON_KEY` | Project Settings → API → anon public |
  | `STAGING_SUPABASE_PROJECT_REF` | Project Settings → General → Reference ID |
  | `STAGING_SUPABASE_DB_PASSWORD` | The password you saved in Step 1 |

- [ ] **Step 4: Collect production credentials**

  From your existing production Supabase project:

  | Secret name | Where to find it |
  |---|---|
  | `PROD_SUPABASE_PROJECT_REF` | Project Settings → General → Reference ID |
  | `PROD_SUPABASE_DB_PASSWORD` | Project Settings → Database → Database password (Reset if forgotten) |

- [ ] **Step 5: Create a Supabase personal access token**

  Go to [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens) → Generate new token.
  Name it `github-actions`. Copy the value — this is `SUPABASE_ACCESS_TOKEN`.

- [ ] **Step 6: Add all secrets to GitHub**

  Go to your GitHub repo → Settings → Secrets and variables → Actions → New repository secret.
  Add each of these (7 total):

  ```
  STAGING_SUPABASE_URL
  STAGING_SUPABASE_ANON_KEY
  STAGING_SUPABASE_PROJECT_REF
  STAGING_SUPABASE_DB_PASSWORD
  PROD_SUPABASE_PROJECT_REF
  PROD_SUPABASE_DB_PASSWORD
  SUPABASE_ACCESS_TOKEN
  ```

- [ ] **Step 7: Verify**

  GitHub repo → Settings → Secrets and variables → Actions. Confirm all 7 secrets appear in the list.

---

## Task 2: Enable Railway preview environments + install Supabase CLI + repair migration history

**Manual infrastructure — no code changes, no commit.**

### Part A: Enable Railway PR preview environments

- [ ] **Step 1: Enable preview environments in Railway**

  Go to your Railway project → the production service → Settings → Preview Environments → Enable.

  Railway will now automatically spin up a new ephemeral service for each PR opened against `main`. It posts a `deployment_status` event to GitHub when the preview is ready.

- [ ] **Step 2: Verify Railway is connected to GitHub**

  In Railway: project settings → Source → confirm it's connected to your GitHub repo. If not, connect it now.

### Part B: Install Supabase CLI

- [ ] **Step 3: Install the Supabase CLI on Windows**

  Run in PowerShell (requires winget, built into Windows 11):

  ```powershell
  winget install Supabase.CLI
  ```

  Close and reopen your terminal after installation.

- [ ] **Step 4: Verify installation**

  ```powershell
  supabase --version
  ```

  Expected: a version string like `2.x.x`

- [ ] **Step 5: Log in to Supabase CLI**

  ```powershell
  supabase login
  ```

  This opens a browser. Sign in and authorize. Back in the terminal you should see "Logged in".

### Part C: Apply all migrations to staging (fresh project — no repair needed)

- [ ] **Step 6: Link CLI to staging project**

  Replace `<staging-ref>` with the value of `STAGING_SUPABASE_PROJECT_REF` from Task 1:

  ```powershell
  supabase link --project-ref <staging-ref>
  ```

  When prompted for the database password, enter `STAGING_SUPABASE_DB_PASSWORD`.

- [ ] **Step 7: Push all migrations to staging**

  ```powershell
  supabase db push
  ```

  Expected output: 8 migrations applied successfully. Since staging is a brand-new project with no tables, all 8 migrations run cleanly from scratch.

- [ ] **Step 8: Verify staging migration state**

  ```powershell
  supabase migration list
  ```

  Expected: all 8 migrations listed as `applied`.

### Part D: Repair migration history on production

Production already has all 8 migrations applied (via the Supabase dashboard), but the CLI doesn't know about them. We need to mark them as applied without re-running them.

- [ ] **Step 9: Link CLI to production project**

  Replace `<prod-ref>` with `PROD_SUPABASE_PROJECT_REF`:

  ```powershell
  supabase link --project-ref <prod-ref>
  ```

  When prompted for the database password, enter `PROD_SUPABASE_DB_PASSWORD`.

- [ ] **Step 10: Check current migration state on production**

  ```powershell
  supabase migration list
  ```

  Look at the output. If migrations show as `pending` (not applied), proceed to Step 11. If they already show as `applied`, skip to Step 12.

- [ ] **Step 11: Mark all existing migrations as applied (do not re-run)**

  ```powershell
  supabase migration repair --status applied --version 001
  supabase migration repair --status applied --version 002
  supabase migration repair --status applied --version 003
  supabase migration repair --status applied --version 004
  supabase migration repair --status applied --version 005
  supabase migration repair --status applied --version 006
  supabase migration repair --status applied --version 007
  supabase migration repair --status applied --version 008
  ```

- [ ] **Step 12: Verify production migration state**

  ```powershell
  supabase migration list
  ```

  Expected: all 8 migrations listed as `applied`. Run `supabase db push` — expected output: "no migrations to apply" (or similar). If it tries to run any migration, stop and do not proceed — re-run the repair for that version.

---

## Task 3: Create migrate.yml

**Files:**
- Create: `.github/workflows/migrate.yml`

- [ ] **Step 1: Create the workflow file**

  Create `.github/workflows/migrate.yml` with this exact content:

  ```yaml
  name: Migrate

  on:
    pull_request:
    push:
      branches: [main]

  permissions:
    contents: read

  concurrency:
    group: migrate-${{ github.ref }}
    cancel-in-progress: true

  jobs:
    migrate-staging:
      name: Migrate staging
      if: github.event_name == 'pull_request'
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: supabase/setup-cli@v1
          with:
            version: latest
        - run: supabase link --project-ref ${{ secrets.STAGING_SUPABASE_PROJECT_REF }}
          env:
            SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
        - run: supabase db push --password ${{ secrets.STAGING_SUPABASE_DB_PASSWORD }}
          env:
            SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}

    migrate-production:
      name: Migrate production
      if: github.event_name == 'push'
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: supabase/setup-cli@v1
          with:
            version: latest
        - run: supabase link --project-ref ${{ secrets.PROD_SUPABASE_PROJECT_REF }}
          env:
            SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
        - run: supabase db push --password ${{ secrets.PROD_SUPABASE_DB_PASSWORD }}
          env:
            SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
  ```

- [ ] **Step 2: Commit**

  ```bash
  git add .github/workflows/migrate.yml
  git commit -m "ci: add Supabase migration workflow for staging and production"
  ```

- [ ] **Step 3: Push and verify**

  Push the branch and open a draft PR. In the PR's Checks tab, confirm the `Migrate staging` job appears and passes. If it fails, check the Actions log — the most likely cause is a missing or misspelled GitHub Secret.

---

## Task 4: Update playwright.config.ts and global-setup.ts for CI

**Files:**
- Modify: `playwright.config.ts`
- Modify: `tests/e2e/global-setup.ts`

These two files currently hardcode the local Supabase URL and localhost. In CI, they need to read from environment variables so they can target the staging Supabase project and the Railway preview URL.

- [ ] **Step 1: Update playwright.config.ts**

  Replace the full content of `playwright.config.ts` with:

  ```ts
  import { defineConfig, devices } from '@playwright/test'

  export default defineConfig({
    testDir: './tests/e2e',
    timeout: 30_000,
    retries: 0,
    use: {
      baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
      ...devices['Desktop Chrome'],
      headless: true,
    },
    globalSetup: './tests/e2e/global-setup.ts',
    webServer: process.env.BASE_URL
      ? undefined
      : {
          command: 'npm run dev',
          url: 'http://localhost:3000',
          reuseExistingServer: true,
          timeout: 30_000,
        },
  })
  ```

  When `BASE_URL` is set (CI against Railway preview), the local dev server is skipped. When it is not set (local development), the dev server starts as before.

- [ ] **Step 2: Verify playwright.config.ts locally still works**

  ```bash
  npx playwright test
  ```

  Expected: same 3 tests pass as before. This confirms the local dev server path still works when `BASE_URL` is unset.

- [ ] **Step 3: Update global-setup.ts**

  Replace the full content of `tests/e2e/global-setup.ts` with:

  ```ts
  // Uses raw fetch against the Supabase REST/Auth APIs so we don't pull in the
  // realtime client (which requires native WebSocket — absent in Node.js < 22).

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!SUPABASE_URL || !ANON_KEY) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set before running Playwright'
    )
  }

  export const USER_A = {
    email: 'playwright-test-a@mailinator.com',
    password: 'PlaywrightTest123!',
    username: 'playwright-test-a',
  }

  export const USER_B = {
    email: 'playwright-test-b@mailinator.com',
    password: 'PlaywrightTest123!',
    username: 'playwright-test-b',
  }

  const authHeaders = {
    apikey: ANON_KEY,
    'Content-Type': 'application/json',
  }

  async function signInOrSignUp(credentials: { email: string; password: string }) {
    const signInRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ email: credentials.email, password: credentials.password }),
    })

    if (signInRes.ok) {
      const data = await signInRes.json()
      return { accessToken: data.access_token as string, userId: data.user.id as string }
    }

    const signUpRes = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ email: credentials.email, password: credentials.password }),
    })
    if (!signUpRes.ok) {
      const err = await signUpRes.text()
      throw new Error(`Failed to create test user ${credentials.email}: ${err}`)
    }
    const data = await signUpRes.json()
    return { accessToken: data.access_token as string, userId: data.user.id as string }
  }

  export default async function globalSetup() {
    const [sessionB, sessionA] = await Promise.all([
      signInOrSignUp(USER_B),
      signInOrSignUp(USER_A),
    ])

    const res = await fetch(`${SUPABASE_URL}/rest/v1/messages`, {
      method: 'POST',
      headers: {
        ...authHeaders,
        Authorization: `Bearer ${sessionB.accessToken}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        sender_id: sessionB.userId,
        receiver_id: sessionA.userId,
        content: `E2E seed message ${Date.now()}`,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Failed to seed test message: ${err}`)
    }
  }
  ```

- [ ] **Step 4: Verify global-setup.ts still works locally**

  Your local `.env.local` already has `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` set (these are the production values used for local dev). Playwright loads `.env.local` automatically via Next.js. Run:

  ```bash
  npx playwright test
  ```

  Expected: 3 tests pass. The global setup reads from `.env.local` and hits the production Supabase (same as before — test users already exist there). In CI, these env vars are injected from the `STAGING_*` secrets instead.

- [ ] **Step 5: Commit**

  ```bash
  git add playwright.config.ts tests/e2e/global-setup.ts
  git commit -m "test: read Supabase URL and base URL from env vars for CI compatibility"
  ```

---

## Task 5: Create e2e.yml

**Files:**
- Create: `.github/workflows/e2e.yml`

- [ ] **Step 1: Create the workflow file**

  Create `.github/workflows/e2e.yml` with this exact content:

  ```yaml
  name: E2E

  on:
    deployment_status: {}

  permissions:
    contents: read

  jobs:
    e2e:
      name: Playwright smoke tests
      if: github.event.deployment_status.state == 'success'
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with:
            node-version: 'lts/*'
            cache: 'npm'
        - run: npm ci
        - run: npx playwright install chromium --with-deps
        - run: npx playwright test
          env:
            BASE_URL: ${{ github.event.deployment_status.target_url }}
            NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.STAGING_SUPABASE_URL }}
            NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.STAGING_SUPABASE_ANON_KEY }}
  ```

  **How this works:** Railway posts a `deployment_status` webhook to GitHub each time a preview environment becomes live. The `if:` condition filters out non-success events (e.g., `pending`, `error`). `target_url` contains the live Railway preview URL — passed to Playwright as `BASE_URL`, which `playwright.config.ts` uses as `baseURL`. The global setup reads staging Supabase credentials from the injected env vars.

- [ ] **Step 2: Commit**

  ```bash
  git add .github/workflows/e2e.yml
  git commit -m "ci: add Playwright E2E workflow triggered by Railway deployment_status"
  ```

- [ ] **Step 3: Push and open a real PR to verify end-to-end**

  Push the branch and open (or convert from draft) a PR. Watch the Checks tab:
  1. `Migrate staging` job should appear and pass
  2. Railway should spin up a preview environment (visible in the PR's Deployments section)
  3. Once the preview is live, `Playwright smoke tests` job should appear and pass

  If the E2E job does not appear, check that Railway is configured to report deployment status back to GitHub (Railway → project → source → GitHub integration settings).

---

## Task 6: Update CLAUDE.md and write ADR-006

**Files:**
- Modify: `CLAUDE.md`
- Create: `docs/adr/ADR-006-cicd-pipeline.md`

- [ ] **Step 1: Add Environments section to CLAUDE.md**

  In `CLAUDE.md`, add the following section after the existing architecture sections (after the "Database schema" section, before "Environment"):

  ```markdown
  ### Environments

  | Environment | Railway | Supabase Project | Purpose |
  |---|---|---|---|
  | Production | main service | `chat-app-production` | Real users; deployed on merge to main |
  | Staging | PR preview (auto) | `chat-app-staging` | CI, Playwright E2E, PR previews |

  Playwright test users (`playwright-test-a@mailinator.com`, `playwright-test-b@mailinator.com`) live in the staging Supabase project only — never in production.

  **Migration rule:** Never apply migrations to production manually. All migrations go through CI (`migrate.yml` → staging on PR, production on merge to main).

  **Railway preview URL format:** `<service>-<branch>-<project>.up.railway.app`. Available in GitHub Actions as `github.event.deployment_status.target_url`.
  ```

- [ ] **Step 2: Write ADR-006**

  Create `docs/adr/ADR-006-cicd-pipeline.md`:

  ```markdown
  # ADR-006: Two-Environment CI/CD Pipeline

  **Date:** 2026-06-23  
  **Status:** Accepted

  ## Context

  The project needed automated validation on PRs before merge. Options ranged from unit tests only (existing) to a full preview environment with E2E tests. Two Supabase environment strategies were considered: a single project (simpler) or two separate projects (staging + production).

  ## Decision

  Use two separate Supabase projects (staging + production) with Railway PR preview environments and Playwright smoke tests triggered by Railway's `deployment_status` webhook.

  Pipeline:
  - PR open/update → migrations against staging → Railway preview → deployment_status → Playwright smoke tests
  - Merge to main → migrations against production → Railway production deploy

  ## Rationale

  - **Single Supabase project rejected:** Playwright test users and seed data would live in the production database. Test inserts would appear as real data and RLS policies would apply to test users.
  - **Supabase branching (ephemeral per PR) rejected:** Paid feature (~$10/month). Overkill for current team size — worth revisiting if concurrent PR test interference becomes an issue.
  - **`deployment_status` trigger over `pull_request`:** E2E tests need a live deployed URL. Triggering on `pull_request` would require the app to be deployed first anyway. The `deployment_status` event fires exactly when Railway signals the preview is ready, avoiding race conditions.
  - **Persistent staging users:** Playwright's `global-setup.ts` is idempotent — creates test users if missing. Simpler than a per-run seed/teardown function.

  ## Consequences

  - All production migrations must go through CI — no manual dashboard SQL after this is set up.
  - Staging Supabase project must stay in sync with production schema at all times.
  - Playwright test users must not be created in production (they currently are — cleanup required).
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add CLAUDE.md docs/adr/ADR-006-cicd-pipeline.md
  git commit -m "docs: add Environments section to CLAUDE.md and ADR-006 for CI/CD pipeline"
  ```

---

## Post-Implementation: Clean up production test users

After staging is set up and Playwright tests pass against the staging project, the test users in production should be removed.

In the production Supabase dashboard: Authentication → Users → find `playwright-test-a@mailinator.com` and `playwright-test-b@mailinator.com` → delete both.

This is a manual step, not part of the automated pipeline.
