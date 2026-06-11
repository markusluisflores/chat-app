# ADR-002: Supabase Dual Client Pattern

**Date:** 2026-06-10
**Status:** Accepted

## Context and Problem Statement

Next.js App Router runs code in two environments: the browser (Client Components) and the server (Server Components, Route Handlers). Supabase requires different client construction in each environment because cookie access works differently.

## Decision Drivers

* `@supabase/ssr` requires cookies to be read/written for session management
* In the browser, cookies are accessible via `document.cookie` — `createBrowserClient` handles this automatically as a singleton
* On the server, cookies must be read from the request and written to the response — `createServerClient` requires passing `await cookies()` from Next.js
* Using the wrong client in the wrong environment causes session loss or build errors

## Considered Options

* **Single universal client** — detect environment at runtime and branch internally
* **Dual client files (chosen)** — `lib/supabase/client.ts` for Client Components, `lib/supabase/server.ts` for Server Components/Route Handlers, `lib/supabase/middleware.ts` for `proxy.ts` only

## Decision Outcome

**Chosen: Dual client files** — because the construction APIs are fundamentally different (`createBrowserClient` vs `createServerClient`) and the cookie handling requirements are incompatible. Separate files make the correct import obvious and prevent misuse.

### Consequences

* ✅ Clear rule: import from `client.ts` in `'use client'` files, `server.ts` everywhere else
* ✅ `createBrowserClient` singleton is preserved — no duplicate Supabase instances
* ⚠️ Route protection lives in `app/(chat)/layout.tsx` (server), NOT in `proxy.ts` — the proxy only refreshes the session token
* ⚠️ Never import `lib/supabase/server.ts` in a Client Component — it uses `await cookies()` which is not available in the browser
