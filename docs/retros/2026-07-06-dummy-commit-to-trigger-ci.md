# Retro: Dummy Commit Pushed to Trigger a CI Deployment

**Date:** 2026-07-06
**Type:** process
**Status:** resolved

---

## What Happened

While waiting to verify that the corrected `RAILWAY_TOKEN` GitHub secret would fix the E2E workflow's 403 error, a commit was pushed with the only purpose of triggering a Railway `deployment_status` event — which would in turn fire the E2E workflow. The commit changed one comment line in `e2e.yml` and served no functional purpose. It was immediately reverted when the user flagged it.

---

## Why It Was Wrong

1. **It pollutes git history.** Every commit should represent a meaningful, intentional change. A commit whose sole purpose is to cause a side effect appears in `git log`, PR diffs, and blame permanently — it is noise that reviewers and future contributors have to read around.

2. **It is a workaround, not a fix.** The root problem was that `e2e.yml` had no `workflow_dispatch` trigger, leaving no sanctioned way to run it manually. Instead of adding that trigger, a dummy commit was used to exploit the `deployment_status` trigger. The escape hatch was missing and instead of adding it, it was routed around.

3. **It violated the no-workarounds rule already in this project.** The rule says: when a tool or process doesn't support what's needed, surface the gap and fix it. A dummy commit is a workaround.

4. **The right tools already existed and were not checked.** Railway MCP has a `deploy` tool that can trigger a redeployment without touching the codebase. `gh workflow run` works on any workflow with `workflow_dispatch`. Neither was checked before reaching for the commit approach.

---

## Why `workflow_dispatch` Was Missed on First Implementation

When `e2e.yml` was first built (PR #26), the design goal was automation: trigger on `deployment_status`, set vars, run Playwright. Manual triggering was not a stated requirement and was not considered.

This is a process gap, not a judgment call. A complete CI workflow includes a manual escape hatch by default — not when the need is first felt. There was no checklist item that enforced this at implementation time, so it was never designed in. By the time we needed it, the pattern of "push something" felt like the fastest path.

**The lesson:** "workflow_dispatch" is not a nice-to-have. It is a baseline requirement for any CI workflow that is also triggered automatically. A workflow you cannot run on-demand without a code change is incomplete.

---

## What We Can Improve

- Every new CI workflow must include `workflow_dispatch` at the time it is first written — not after the first time it's needed
- Before reaching for any commit to cause a side effect, ask: does the platform provide a native trigger? (Railway MCP `deploy`, `gh workflow run`, "Re-run jobs" button)
- The no-workarounds rule should explicitly name the dummy-commit pattern, since it feels different from "trying a workaround API call" but is the same anti-pattern

---

## Action Items

| Item | Status |
|---|---|
| Revert the dummy commit | Done |
| Add `workflow_dispatch` to `e2e.yml` | Done |
| Update `feedback_no_workarounds.md` to include dummy-commit pattern | Done |
| Add "CI/CD Standards" section to global CLAUDE.md with `workflow_dispatch` checklist | Done |
| Add CI Runbook to project CLAUDE.md | Done |
| Write git commit standard to `C:\Users\Miko\.claude\standards\git-commit-standard.md` | Done |
