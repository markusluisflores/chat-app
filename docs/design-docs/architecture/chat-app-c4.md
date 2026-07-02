# C4 Architecture Diagrams — Chat App

> C1 (System Context) and C2 (Container) diagrams per the C4 model (Simon Brown).
> C3 component and C4 code diagrams are available on request.

---

## Bounded Contexts

| Context | Responsibility | Key files |
|---|---|---|
| **Auth** | Login, register, session lifecycle, email confirmation | `app/(auth)/`, `app/auth/callback/route.ts`, `proxy.ts`, `lib/supabase/` |
| **Messaging** | Send/receive messages, read receipts, realtime delivery | `app/(chat)/chat/[username]/`, `hooks/useMessages.ts`, `components/chat/` |
| **Presence** | Online/offline status, realtime tracking | `context/PresenceContext.tsx`, `hooks/usePresence.ts` |
| **Profiles** | User profiles, avatars, display names, username-based routing | `app/(chat)/layout.tsx` (SSR fetch), `components/nav/`, `components/conversations/` |

---

## C1 — System Context

```mermaid
C4Context
    title C1 — System Context: Chat App

    Person(user, "User", "Sends and receives real-time direct messages via browser")

    System(chatApp, "Chat App", "Real-time 1:1 messaging application built with Next.js 16 / React 19 / Supabase / Railway")

    System_Ext(supabase, "Supabase", "Auth (JWT + PKCE), PostgreSQL, Realtime (WebSocket), Storage")
    System_Ext(railway, "Railway", "PaaS hosting — production service and auto-created PR preview environments")
    System_Ext(github, "GitHub / GitHub Actions", "Source control + CI/CD: test, lint-and-build, migrate, e2e workflows")
    System_Ext(emailProvider, "Email Provider", "Sends account-confirmation emails via Supabase SMTP")

    Rel(user, chatApp, "Uses", "HTTPS")
    Rel(chatApp, supabase, "Auth, DB reads/writes, Realtime subscriptions", "HTTPS / WSS")
    Rel(github, railway, "Triggers deployments on PR open and merge to main", "Railway API")
    Rel(github, supabase, "Applies DB migrations (migrate.yml)", "Supabase CLI / HTTPS")
    Rel(github, chatApp, "Playwright E2E smoke tests against Railway preview URL", "HTTPS")
    Rel(supabase, emailProvider, "Sends confirmation email on register", "SMTP")
```

---

## C2 — Container Diagram

```mermaid
C4Container
    title C2 — Container Diagram: Chat App

    Person(user, "User", "Browser")

    System_Boundary(chatAppBoundary, "Chat App") {
        Container(nextServer, "Next.js Server", "Next.js 16 App Router", "Server Components, Route Handlers, auth-guarded layout, SSR session seeding via initialSession prop")
        Container(reactClient, "React Client Bundle", "React 19, Tailwind v4", "Client Components: ChatPanel, ConversationList, NavSidebar, PresenceContext — realtime subscriptions live here")
        Container(proxy, "proxy.ts", "Next.js 16 proxy (renamed from middleware)", "Refreshes Supabase session token on every request; does not enforce auth — auth guard is in app/(chat)/layout.tsx")
    }

    System_Boundary(supabaseBoundary, "Supabase") {
        Container(supabaseAuth, "Auth Service", "Supabase Auth", "JWT issuance, PKCE email-confirmation flow, session refresh. Server client in lib/supabase/server.ts; browser client in lib/supabase/client.ts")
        Container(postgres, "PostgreSQL", "Supabase Postgres + PostgREST", "profiles + messages tables with RLS. mark_messages_read() security-definer RPC lets receivers write read_at without violating sender-only UPDATE policy")
        Container(realtime, "Realtime Service", "Supabase Realtime", "presence:online WebSocket channel (PresenceContext singleton); postgres_changes INSERT subscriptions on messages (useMessages, ConversationList)")
    }

    Rel(user, nextServer, "Requests pages", "HTTPS")
    Rel(user, reactClient, "Interacts with UI after hydration", "Browser events")
    Rel(proxy, supabaseAuth, "Refreshes session cookie on every request", "HTTPS")
    Rel(nextServer, supabaseAuth, "Validates session server-side (createServerClient)", "HTTPS")
    Rel(nextServer, postgres, "Fetches all profiles for layout SSR", "HTTPS")
    Rel(reactClient, supabaseAuth, "Login / register (createBrowserClient singleton)", "HTTPS")
    Rel(reactClient, postgres, "Sends messages, marks read, loads conversation history", "HTTPS")
    Rel(reactClient, realtime, "Presence tracking + message INSERT subscriptions", "WSS")
```

---

## Key Architectural Notes

- **Two Supabase clients, never swapped** — `createBrowserClient` (singleton, Client Components) vs `createServerClient` with `await cookies()` (Server Components / Route Handlers). See CLAUDE.md.
- **Realtime channel singleton** — `supabase.channel()` reuses channels by topic in the browser singleton. PresenceContext owns the single `presence:online` channel. Multiple components calling `supabase.channel('presence:online')` causes "cannot add presence callbacks after subscribe()". See ADR-001.
- **Realtime cleanup** — `channel.teardown() + (supabase.realtime as any)._remove(channel)` instead of `supabase.removeChannel()`. The official API is async and leaves the channel in the internal array long enough for React Strict Mode's double-invoke. See ADR-005.
- **Auth guard location** — Route protection is in `app/(chat)/layout.tsx` (Server Component), not in `proxy.ts`. The proxy only refreshes the token.
