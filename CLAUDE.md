# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev          # start dev server (default port 3000)
npm run build        # production build
npm run lint         # ESLint
npm run test         # Vitest in watch mode
npm run test:run     # Vitest single run (CI)
```

Run a single test file:
```bash
npm run test -- tests/hooks/usePresence.test.ts
```

Tests require `cross-env NODE_OPTIONS=--experimental-require-module` (already wired into the npm scripts) due to a Tailwind v4 CJS/ESM conflict on Windows.

## Architecture

### Route groups

- `app/(auth)/` — unauthenticated routes (`/login`, `/register`). No shared layout.
- `app/(chat)/` — protected routes. `layout.tsx` is a Server Component that auth-guards, fetches all profiles, and renders the 3-panel shell (NavSidebar + ConversationList + main).
- `app/auth/callback/route.ts` — exchanges the Supabase email-confirmation code for a session, then redirects to `/chat`.

### Next.js 16 breaking change: proxy.ts

Next.js 16 renamed `middleware.ts` → `proxy.ts` with the exported function renamed `middleware` → `proxy`. The file at the repo root is `proxy.ts`. Do not create `middleware.ts`.

### Supabase client pattern

There are two separate clients — never use the wrong one in the wrong context:

| File | Usage |
|---|---|
| `lib/supabase/client.ts` | Client Components — `createBrowserClient` (singleton in browser) |
| `lib/supabase/server.ts` | Server Components / Route Handlers — `createServerClient` with `await cookies()` |
| `lib/supabase/middleware.ts` | `proxy.ts` only — refreshes session token, does not enforce auth |

Route protection is in `app/(chat)/layout.tsx`, not in the proxy.

### Session management (dual layer)

1. **Supabase cookie layer** — `@supabase/ssr` manages the JWT in cookies via the proxy and server client.
2. **React `SessionContext`** — seeded from SSR in `app/layout.tsx` via `initialSession` prop; syncs live via `onAuthStateChange`. Use `useSession()` in Client Components.

### Realtime

**Presence** — `context/PresenceContext.tsx` holds a single `presence:online` channel. All three consumers (`NavSidebar`, `ConversationList`, `ChatPanel`) call `usePresence()` from this context. Do NOT call `supabase.channel('presence:online')` in multiple components simultaneously — `createBrowserClient` is a singleton and `supabase.channel()` reuses channels by topic, causing a "cannot add presence callbacks after subscribe()" error. See [ADR-001](docs/adr/ADR-001-presence-context-singleton.md).

**Messages** — `hooks/useMessages.ts` subscribes to `postgres_changes` INSERT on `messages`, filtered to the active conversation pair.

**Realtime cleanup pattern** — When unsubscribing Realtime channels in `useEffect` cleanup, use:
```ts
channel.teardown()
;(supabase.realtime as any)._remove(channel)
```
`supabase.removeChannel()` is async and leaves the channel in the internal array long enough for React Strict Mode's double-invoke to pick it up as already-subscribed. See [ADR-005](docs/adr/ADR-005-realtime-channel-cleanup.md).

### Database schema

Two tables: `profiles` (one row per auth user, auto-created by trigger on `auth.users`) and `messages`. RLS is enabled on both. Key policies: only participants can read messages; only senders can insert (enforced by `auth.uid() = sender_id`). `mark_messages_read(p_sender_id, p_receiver_id)` is a security-definer RPC used by the receiver to mark messages read without violating the sender-only UPDATE policy. See [ADR-004](docs/adr/ADR-004-mark-messages-read-rpc.md).

Migrations live in `supabase/migrations/` (001–008) and have been applied to the remote project.

### Environments

| Environment | Railway | Supabase Project | Purpose |
|---|---|---|---|
| Production | main service | `chat-app-production` | Real users; deployed on merge to main |
| Staging | PR preview (auto) | `chat-app-staging` | CI, Playwright E2E, PR previews |

Playwright test users (`playwright-test-a@mailinator.com`, `playwright-test-b@mailinator.com`) live in the staging Supabase project only — never in production.

**Migration rule:** Never apply migrations to production manually. All migrations go through CI (`migrate.yml` → staging on PR, production on merge to main).

**Railway preview URL format:** `https://chat-app-{env-name}.up.railway.app`. Construct `env-name` from `github.event.deployment_status.environment` (format: `<project> / <env-name>`) by stripping the project prefix: `${FULL_ENV##* / }`. Neither `target_url` nor `environment_url` from the `deployment_status` event gives the app URL — both point to the Railway dashboard.

**New PR environments inherit Railway vars from production by default.** The E2E workflow (`e2e.yml`) automatically corrects this before running Playwright: it sets `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to staging values on both the chat-app and worker services, and updates the staging webhook function to point at the PR's Railway URL. Requires GitHub secrets `RAILWAY_TOKEN`, `STAGING_SUPABASE_SERVICE_ROLE_KEY`, and `STAGING_SUPABASE_WEBHOOK_SECRET`. See issue #25 and PR #26.

### Environment

`.env.local` (not in git) requires:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

### Types

Shared types (`Profile`, `Message`, `Session`) are in `types/index.ts`. Use `@/` for all imports — it resolves to the repo root.

## CI Runbook

### e2e.yml — Playwright E2E smoke tests

**Triggers:** `deployment_status` (automatic on Railway deploy) or `workflow_dispatch` (manual)

**Manual trigger:**
```bash
gh workflow run e2e.yml -f environment=<railway-env-name>
# Example: gh workflow run e2e.yml -f environment=chat-app-pr-26
```

**Secrets required:**

| Secret | Purpose |
|---|---|
| `RAILWAY_TOKEN` | Railway personal API token — Account Settings → Tokens. Must be a personal token, not the CLI OAuth session token. |
| `STAGING_SUPABASE_URL` | `NEXT_PUBLIC_SUPABASE_URL` for the staging Supabase project |
| `STAGING_SUPABASE_ANON_KEY` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` for staging |
| `STAGING_SUPABASE_SERVICE_ROLE_KEY` | Service role key for staging (applied to worker service only) |
| `SUPABASE_ACCESS_TOKEN` | Supabase Management API token for updating the webhook function |
| `STAGING_SUPABASE_PROJECT_REF` | Project ref ID of the staging Supabase project |
| `SUPABASE_WEBHOOK_SECRET` | Shared secret for `handle_message_insert_webhook` |

**Known failure modes:**

| Symptom | Cause | Fix |
|---|---|---|
| `HTTP Error 403` on Railway GraphQL step | `RAILWAY_TOKEN` is wrong type or expired | Regenerate at railway.app → Account → Settings → Tokens. Must be a personal API token. |
| `Environment "X" not found` on Railway step | PR environment name doesn't match Railway's | Check "Resolve environment name" step logs for the raw value of `deployment_status.environment` |
| Playwright tests fail with auth errors | PR environment is still using production Supabase vars | Check "Set staging Supabase vars" step — if it passed, confirm Railway redeployed the service with the new vars |
| `migrate.yml` fails with migration conflict | Staging has a migration applied out-of-band (e.g., via MCP) that isn't in the branch | Make the migration idempotent (`IF NOT EXISTS`) and remove the phantom entry from `supabase_migrations.schema_migrations` |
| `Migrate staging` fails immediately on every PR | `chat-app-staging` Supabase project is paused (free plan — only one active project allowed) | Unpause staging in the Supabase dashboard before opening PRs |

## Operations

### Production Rollback

Railway keeps a full deployment history per service. To roll back a bad production deploy:

1. Railway dashboard → project `invigorating-vitality` → `chat-app` service → **Deployments** tab
2. Find the last successful deployment → click **⋮** → **Redeploy**

Or via CLI:
```bash
railway deployments          # list recent deployments with IDs
railway redeploy <id>        # redeploy a specific version
```

The rollback is instant — Railway swaps the running container without a rebuild.
