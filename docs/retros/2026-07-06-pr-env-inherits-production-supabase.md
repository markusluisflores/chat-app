# Retro: PR Environments Inherit Production Supabase Vars

**Date:** 2026-07-06  
**Type:** incident  
**Status:** pending (fix in PR #26)

---

## What Went Right
- The bug was caught when testing PR #24 — we had E2E tests that actually ran against a real deployed environment, which surfaced the failure instead of masking it
- The root cause was identified quickly once we noticed test users couldn't log in: Playwright users only exist in staging, so a production Supabase connection is an immediate signal
- The fix design is comprehensive — it handles both chat-app vars, worker vars, and the webhook URL in one pass, so future PRs get the full staging environment automatically

## What Went Wrong
- Every PR since CI was set up has been running E2E against production Supabase without us realizing it. Railway's default of inheriting production vars on new PR environments was never questioned.
- When the CLAUDE.md was updated with the note about Railway PR env inheritance, it was written as a manual step ("manually set via Railway dashboard") instead of being automated immediately. We accepted a manual process that was guaranteed to be forgotten on every new PR.
- Two rounds of manual fixes were needed for PR #24 (first: set chat-app vars; second: also update the webhook URL) because the scope of the problem wasn't assessed fully the first time.
- The `STAGING_SUPABASE_SERVICE_ROLE_KEY` on the worker was never corrected for PR #24 because it felt too risky to share the key in chat — there was no process for how to handle staging secrets that can't go through Claude Code.

## What We Can Improve
- Document the Railway PR inheritance behavior in the deployment runbook so it's never an assumption again
- When a new E2E environment fails with "no test users found" or equivalent auth errors, check the Supabase project connection before debugging test logic
- Secrets that bypass RLS (service role keys) need an out-of-band setup path — either a separate terminal workflow or automation. Write this process down so it's clear what to do when the situation arises.

## Action Items

| Item | Status |
|---|---|
| Merge PR #26 — automates staging var setup on every Railway PR environment | Pending |
| Add 3 new GitHub secrets: `RAILWAY_TOKEN`, `STAGING_SUPABASE_SERVICE_ROLE_KEY`, `STAGING_SUPABASE_WEBHOOK_SECRET` | Pending |
| After PR #26 merges, verify PR #24 E2E passes automatically with no manual var setting | Pending |
| Update CLAUDE.md to remove the "manually set via Railway dashboard" note (automated now) | Pending |
