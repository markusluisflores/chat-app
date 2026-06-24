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
