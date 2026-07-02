# C4 Architecture Diagram — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add C1 (System Context) and C2 (Container) architecture diagrams to the chat-app repo using the C4 model, documenting the system structure in a standard, portable format.

**Architecture:** A single Markdown file containing two Mermaid diagrams and a bounded-context summary. No code changes — documentation only.

**Tech Stack:** Markdown, Mermaid C4 syntax (`C4Context`, `C4Container`), git, GitHub CLI

## Global Constraints

- Documentation only — no source code changes in this PR
- Mermaid C4 syntax (`C4Context` / `C4Container`) — GitHub renders both natively
- File path: `docs/design-docs/architecture/chat-app-c4.md`
- Branch: `docs/c4-diagram`
- Every `Rel()` in C2 must include a protocol or label as the third argument

---

### Task 1: Create C4 diagram file

**Files:**
- Create: `docs/design-docs/architecture/chat-app-c4.md` (directory does not exist yet)

- [ ] **Step 1: Create the branch and directory**

  ```bash
  git checkout main
  git pull
  git checkout -b docs/c4-diagram
  mkdir -p docs/design-docs/architecture
  ```

- [ ] **Step 2: Write the diagram file**

  Create `docs/design-docs/architecture/chat-app-c4.md` with this content:

  ````markdown
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
  flowchart TD
      classDef person fill:#08427b,stroke:#052e56,color:#fff
      classDef system fill:#1168bd,stroke:#0b4884,color:#fff
      classDef external fill:#6b6b6b,stroke:#4a4a4a,color:#fff

      User["👤 **User**\nBrowser"]:::person

      App["**Chat App**\nNext.js 16 · React 19\nReal-time 1:1 messaging"]:::system

      Supabase["**Supabase**\nAuth · PostgreSQL\nRealtime · Storage"]:::external
      Railway["**Railway**\nPaaS hosting\nProduction + PR previews"]:::external
      GitHub["**GitHub Actions**\nCI/CD\ntest · lint · migrate · e2e"]:::external
      Email["**Email Provider**\nAccount confirmation\nvia Supabase SMTP"]:::external

      User -->|"HTTPS"| App
      App -->|"HTTPS / WSS"| Supabase
      GitHub -->|"Railway API — triggers deployments"| Railway
      GitHub -->|"Supabase CLI — applies migrations"| Supabase
      GitHub -->|"HTTPS — Playwright E2E tests"| App
      Supabase -->|"SMTP"| Email
  ```

  ---

  ## C2 — Container Diagram

  ```mermaid
  flowchart TD
      classDef person fill:#08427b,stroke:#052e56,color:#fff
      classDef container fill:#1168bd,stroke:#0b4884,color:#fff
      classDef external fill:#6b6b6b,stroke:#4a4a4a,color:#fff

      User["👤 **User**\nBrowser"]:::person

      subgraph ChatApp["Chat App"]
          NextServer["**Next.js Server**\nNext.js 16 App Router\nServer Components · Route Handlers\nauth-guarded layout · SSR session seeding"]:::container
          ReactClient["**React Client Bundle**\nReact 19 · Tailwind v4\nChatPanel · ConversationList\nNavSidebar · PresenceContext"]:::container
          Proxy["**proxy.ts**\nNext.js 16 proxy\nRefreshes session token per request\n(auth guard is in layout.tsx, not here)"]:::container
      end

      subgraph SupabaseBoundary["Supabase"]
          Auth["**Auth Service**\nJWT · PKCE email confirmation\nSession refresh\nServer client · browser client"]:::external
          Postgres["**PostgreSQL**\nPostgres + PostgREST\nprofiles + messages · RLS\nmark_messages_read() RPC"]:::external
          Realtime["**Realtime Service**\npresence:online channel (WSS)\npostgres_changes INSERT\non messages table"]:::external
      end

      User -->|"HTTPS"| NextServer
      User -->|"Browser events"| ReactClient
      Proxy -->|"HTTPS — refreshes cookie"| Auth
      NextServer -->|"HTTPS — validates session"| Auth
      NextServer -->|"HTTPS — fetches profiles for SSR"| Postgres
      ReactClient -->|"HTTPS — login / register"| Auth
      ReactClient -->|"HTTPS — send messages · mark read"| Postgres
      ReactClient -->|"WSS — presence + message inserts"| Realtime
  ```

  ---

  ## Key Architectural Notes

  - **Two Supabase clients, never swapped** — `createBrowserClient` (singleton, Client Components) vs `createServerClient` with `await cookies()` (Server Components / Route Handlers). See CLAUDE.md.
  - **Realtime channel singleton** — `supabase.channel()` reuses channels by topic in the browser singleton. PresenceContext owns the single `presence:online` channel. Multiple components calling `supabase.channel('presence:online')` causes "cannot add presence callbacks after subscribe()". See ADR-001.
  - **Realtime cleanup** — `channel.teardown() + (supabase.realtime as any)._remove(channel)` instead of `supabase.removeChannel()`. The official API is async and leaves the channel in the internal array long enough for React Strict Mode's double-invoke. See ADR-005.
  - **Auth guard location** — Route protection is in `app/(chat)/layout.tsx` (Server Component), not in `proxy.ts`. The proxy only refreshes the token.
  ````

- [ ] **Step 3: Verify**

  Read `docs/design-docs/architecture/chat-app-c4.md` and confirm:
  - Bounded context table has 4 rows (Auth, Messaging, Presence, Profiles)
  - C1 block opens with ` ```mermaid` then `flowchart TD` on the next line
  - C2 block opens with ` ```mermaid` then `flowchart TD` on the next line
  - Every edge in C2 has a label (`-->|"label"|`)
  - Key Architectural Notes section has 4 bullet points

- [ ] **Step 4: Commit and open PR**

  ```bash
  git add docs/design-docs/architecture/chat-app-c4.md
  git commit -m "docs: add C4 architecture diagrams (C1 system context + C2 container)"
  gh pr create --title "docs: add C4 architecture diagrams" --body "$(cat <<'EOF'
  ## Summary

  - Adds `docs/design-docs/architecture/chat-app-c4.md` with C1 (System Context) and C2 (Container) Mermaid diagrams
  - Includes a bounded-context table naming the four contexts: Auth, Messaging, Presence, Profiles
  - Key architectural notes section captures Supabase client rules, Realtime singleton pattern, and auth-guard location in one place for quick reference
  - Documentation only — no code changes

  ## Test plan

  - [ ] Both Mermaid diagrams render on GitHub (check the PR Files tab)
  - [ ] Bounded context table has 4 rows
  - [ ] All C2 `Rel()` entries have a protocol or label annotation
  - [ ] No broken links or references to files that don't exist
  EOF
  )"
  ```
