# SDLC Improvements — Gap Analysis and Implementation Plan

**Date:** 2026-07-06
**Status:** In progress — "Now" items pending implementation
**Branch:** Implement on `main` directly via separate PRs per category, not on a feature branch

---

## Context

Following two process incidents in the same session (a dummy commit pushed to trigger CI, and `workflow_dispatch` missing from `e2e.yml` on first implementation), a systematic audit of SDLC practices was conducted against the full project. This document records what was found, what was decided, and what still needs to be done — so the reasoning survives session boundaries and new projects don't repeat the same gaps.

---

## How We Prevent Missing This on New Projects

Two mechanisms must work together:

**1. New Project Checklist in global CLAUDE.md** — gets a "Code Quality Baseline" subsection covering Husky, ESLint, and the CI checklist. Every new project walks through this explicitly.

**2. Canonical CI template in `github-setup` skill** — the `github-setup` skill copies a CI workflow template into new projects. Once we update `chat-app/ci.yml` with `npm audit` and `tsc --noEmit`, that updated file becomes the reference for the canonical template. Future projects inherit the right CI steps without a checklist reminder.

If only global CLAUDE.md changes, Claude knows to do it but might forget or skip it. If only the canonical template changes, it works automatically but there's no process hook for things that can't be templated (Husky install, ESLint config review). Both are needed.

---

## Gap Analysis

### Already in place (verified — no action needed)

| Area | Evidence |
|---|---|
| TypeScript `strict: true` | `tsconfig.json` confirmed |
| CI runs lint + build + unit tests | `ci.yml` — three jobs verified |
| PR template | `.github/pull_request_template.md` exists |
| Dependabot configured | `.github/dependabot.yml` — weekly Actions, monthly npm |
| ADRs | In use, multiple filed |
| Retros for P0/P1 bugs | Skill and template in use |
| E2E with dedicated staging test accounts | Playwright + staging Supabase only |
| `workflow_dispatch` on e2e.yml | Added this session |
| Git commit standard | Written this session |
| CI/CD Standards checklist | Added to global CLAUDE.md this session |

---

### Decisions

| # | Gap | Decision | Rationale | Tradeoff accepted | Status |
|---|---|---|---|---|---|
| 1 | `npm audit` in CI | **Implement now** | Scans for known CVEs on every PR. One line. Catches what Dependabot misses (advisories without a fix). | `--audit-level=high` only — `moderate` generates noise. May need to add exceptions for known false positives. | Pending |
| 2 | Pre-commit hooks (Husky + lint-staged) | **Implement now** | Catches lint/type errors at commit time instead of after a CI round-trip. Baseline for any TypeScript project. | Adds a `prepare` script that runs `husky install` — slightly lengthens `npm install`. Windows compatibility needs testing. | Pending |
| 3 | ESLint rule tightening | **Implement now** | Add `no-console` (warn), `@typescript-eslint/no-explicit-any` (error). Enforces what code review already manually checks. | `no-explicit-any` will surface existing `as any` casts — each needs a justification comment or a proper type. Audit first before enabling as error. | Pending |
| 4 | Explicit `tsc --noEmit` CI step | **Implement now** | `npm run build` type-checks Next.js files only. Worker and test files are outside that scope. One line closes the gap. | Adds ~30s to CI. Acceptable. | Pending |
| 5 | Definition of Done | **Implement now** | Makes "done" explicit and author-enforced before asking for review. Complements the PR checklist (reviewer) with an author checklist. | Slightly more overhead per PR. Offset by fewer review-cycle back-and-forths. | Pending |
| 6 | Branch naming convention | **Implement now** | Formalizes what's already implied. Adds the valid type list and kebab-case rule so there's no ambiguity. | None significant. | Pending |
| 7 | Dependabot merge policy | **Implement now** | 6+ Dependabot PRs currently open with no policy. Defines when Claude can merge minor/patch without manual review and what triggers escalation. | Minor/patch auto-merge assumes CI is sufficient to catch breakage. It usually is for well-tested deps. | Pending |
| 8 | Rollback procedure | **Implement now** | Railway supports one-click rollback. Documenting it now costs 5 minutes; finding it during an incident costs much more. | None. | Pending |
| 9 | Auto-delete merged branches | **Implement now** | One GitHub settings toggle. Prevents branch accumulation over time. | Branches are deleted after merge — intentionally kept branches (e.g., long-running experiments) must be re-pushed or noted. | Pending |
| 10 | Local dev setup runbook | **Implement later** | Not urgent while context is fresh and it's solo. Worth adding before a multi-week break or before onboarding anyone. | — |
| 11 | RLS integration tests | **Implement later — before real-user launch** | High security value. Tests RLS edge cases that E2E can't reach. Medium implementation effort. | Requires test user credentials and Supabase client setup in the test suite. |
| 12 | Test coverage reporting | **Implement later** | Reporting is useful; hard thresholds become a game. Add reporting first, establish a baseline, then consider a floor. | — |
| 13 | Error tracking (Sentry) | **Implement later — before real users** | Free tier, 15-minute setup. No value until there are users generating real errors. | — |
| 14 | Versioning + CHANGELOG | **Implement later — before first release** | Not relevant until cutting releases. Conventional commits already lay the groundwork. | — |

---

## Implementation Plan — "Now" Items

Group commits by what they touch to keep PRs small and reviewable.

### PR A: CI hardening
**Branch:** `chore/ci-hardening`
**Files:**
- `.github/workflows/ci.yml` — add `npm audit --audit-level=high` step + `npx tsc --noEmit` step

**Commit:**
```
ci: add npm audit and explicit tsc --noEmit checks

npm audit --audit-level=high fails the build on known high/critical CVEs in
the dependency tree. Dependabot opens PRs for outdated packages but does not
fail CI for advisories — this step fills that gap.

tsc --noEmit runs against all TypeScript files including worker/ and tests/,
which are outside the scope of next build's type checking.

Both steps added to the existing lint-and-build job.
```

---

### PR B: Pre-commit hooks
**Branch:** `chore/pre-commit-hooks`
**Files:**
- `package.json` — add `prepare` script, `lint-staged` config, `husky` + `lint-staged` devDeps
- `.husky/pre-commit` — new file
- `package-lock.json` — updated by install

**Commit:**
```
chore(dx): add Husky pre-commit hook with lint-staged

Runs ESLint --fix and tsc --noEmit on staged .ts/.tsx files before each
commit. Catches errors at commit time rather than after a CI round-trip.

lint-staged runs only on staged files — fast enough to not interrupt flow.
tsc --noEmit in the hook is project-wide (staged files alone can't be
type-checked in isolation).
```

---

### PR C: ESLint tightening
**Branch:** `chore/eslint-rules`
**Files:**
- `eslint.config.mjs` — add `no-console` (warn), `@typescript-eslint/no-explicit-any` (error)

**Note:** Before enabling `no-explicit-any` as error, audit existing `as any` casts. Each must be replaced with a proper type or annotated with a justification comment. The ADR-005 realtime cleanup cast is a known intentional exception.

---

### PR D: Process documentation
**Branch:** `chore/process-docs`
**Files:**
- `C:\Users\Miko\.claude\CLAUDE.md` — add Definition of Done section, branch naming convention, Dependabot merge policy, Code Quality Baseline to New Project Checklist
- `C:\ClaudeProjects\chat-app\CLAUDE.md` — add rollback procedure to CI Runbook

**Note:** No code changes. Documentation only.

---

### One-time settings (no PR needed)
- GitHub repo → Settings → General → Pull Requests → enable **"Automatically delete head branches"**

---

## How the New Project Checklist Changes

The following subsection will be added to the New Project Checklist in global CLAUDE.md, after the existing item 7 (`github-setup`):

```
**Code Quality Baseline (for any Node.js/TypeScript project):**
- [ ] Install Husky + lint-staged: `npm install --save-dev husky lint-staged && npx husky init`
- [ ] Add `lint-staged` config to `package.json` (ESLint --fix + tsc --noEmit on .ts/.tsx)
- [ ] Review ESLint config — confirm `no-console` (warn) and `no-explicit-any` (error) are active
- [ ] Add `npm audit --audit-level=high` step to CI
- [ ] Add `npx tsc --noEmit` step to CI
- [ ] Enable "Automatically delete head branches" in GitHub repository settings
- [ ] Verify CI checklist (from "CI/CD Standards" section) before opening first PR
```

The `github-setup` skill's canonical CI template should also be updated to include `npm audit` and `tsc --noEmit` steps once PR A is validated in chat-app.

---

## Revision History

| Date | Change |
|---|---|
| 2026-07-06 | Initial document created from SDLC gap analysis |
