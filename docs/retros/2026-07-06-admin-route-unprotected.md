# Retro: Admin Queue Page Had No Authorization

**Date:** 2026-07-06  
**Type:** incident  
**Status:** pending (fix in PR #24)

---

## What Went Right
- The gap was caught by reviewing the issue list before declaring the project "done" — proactive triage rather than a production report
- The fix is minimal and correct: check `is_admin` after confirming auth, redirect to `/chat` if not admin, no complex middleware needed
- The admin page is internal tooling with no public-facing link, limiting real-world exposure

## What Went Wrong
- The `/admin/queues` page was built as part of the link preview pipeline feature without a security review step on that specific route
- Auth was checked (user must be logged in) but authorization was not (any logged-in user could access admin functions). The distinction wasn't flagged during implementation or review.
- The feature branch review that preceded merging PR #23 did not surface this — there was no explicit checklist item for "does every route enforce appropriate authorization, not just authentication?"

## What We Can Improve
- Add an explicit auth+authz review step whenever a new server route or page is created: "who is allowed to see/use this, and is that enforced?"
- The CLAUDE.md Code Review Checklist should include: check every new route for authorization (not just authentication) — especially admin or privileged routes
- During brainstorming for internal tooling pages, ask explicitly: "should this be behind an admin flag?"

## Action Items

| Item | Status |
|---|---|
| Merge PR #24 — adds is_admin column and authorization check to /admin/queues | Pending |
| Add "check authz on new routes" to the CLAUDE.md Code Review Checklist | Pending |
| Run production SQL to grant admin to markuslsflores@gmail.com after PR #24 merges | Pending |
