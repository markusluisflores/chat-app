# ADR-003: Next.js 16 Uses proxy.ts, Not middleware.ts

**Date:** 2026-06-10
**Status:** Accepted

## Context and Problem Statement

Next.js 16 introduced a breaking change: the request interception layer was renamed from `middleware.ts` to `proxy.ts`, and the exported function was renamed from `middleware` to `proxy`. Any code that uses the old name silently has no effect.

## Decision Drivers

* The project targets Next.js 16.2.7
* The `@supabase/ssr` session-refresh pattern depends on running before every request
* Creating `middleware.ts` instead of `proxy.ts` results in sessions never being refreshed — a silent failure that produces confusing auth bugs

## Considered Options

* **Use `middleware.ts`** — compatible with Next.js 12–15, broken in Next.js 16
* **Use `proxy.ts` (chosen)** — the correct file name for Next.js 16

## Decision Outcome

**Chosen: `proxy.ts`** — because this project runs Next.js 16 and `middleware.ts` is ignored entirely in that version.

### Consequences

* ✅ Supabase session tokens are refreshed before every request
* ⚠️ Do NOT create `middleware.ts` — it will be silently ignored
* ⚠️ The exported function must be named `proxy`, not `middleware`
* ⚠️ If upgrading Next.js documentation or copying patterns from tutorials: most assume Next.js ≤15 and will reference `middleware.ts`
