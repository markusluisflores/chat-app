# Next.js + Supabase Chat App — Design Spec
**Date:** 2026-06-04
**Status:** Approved

---

## Overview

A real-time direct-messaging chat application built with Next.js App Router and Supabase. Users register, log in, browse all registered users, and exchange private DMs that appear instantly via Supabase Realtime. Online/offline presence is tracked globally.

---

## Pages & Navigation

| Route | Description | Auth |
|---|---|---|
| `/` | Redirects to `/chat` or `/login` | — |
| `/login` | Email + password sign-in | Public |
| `/register` | Create account (display name, email, password) | Public |
| `/chat` | Main shell — empty state ("select a user") | Protected |
| `/chat/[userId]` | Active DM conversation with a specific user | Protected |

### Layout (3-panel shell)

```
┌──────────────────────────────────────────────────────────────────┐
│  /chat  — 3-panel shell                                          │
│                                                                  │
│ ┌──────────┐  ┌──────────────────┐  ┌────────────────────────┐  │
│ │  NAV     │  │  CONVERSATIONS   │  │  ACTIVE CHAT           │  │
│ │  ~220px  │  │  ~300px          │  │  flex-1                │  │
│ │          │  │                  │  │                        │  │
│ │ [logo]   │  │ Open      ▾  🔍  │  │  Alice  🟢             │  │
│ │          │  │ ─────────────    │  │  ─────────────────     │  │
│ │ Search   │  │ [avatar]         │  │                        │  │
│ │          │  │ Alice            │  │  Hey, you around? 10:01│  │
│ │ Contacts │  │ Hey you around?  │  │                        │  │
│ │ ──────── │  │          10:01am │  │  Yeah! What's up?      │  │
│ │ 🟢 Alice │  │                  │  │                 10:02  │  │
│ │🔴 Bob    │  │ [avatar]         │  │                        │  │
│ │ 🟢 Carol │  │ Bob              │  │  ┌────────────────────┐│  │
│ │ 🔴 Dave  │  │ Missed Call  📞  │  │  │ Write a message... ││  │
│ │          │  │          9:45am  │  │  └────────────────────┘│  │
│ │ [avatar] │  └──────────────────┘  └────────────────────────┘  │
│ │ You      │                                                     │
│ └──────────┘                                                     │
└──────────────────────────────────────────────────────────────────┘
```

---

## Architecture

### Approach
Next.js 14+ App Router with `@supabase/ssr` for cookie-based auth. Server Components handle initial data fetching (no loading spinners on navigation). Client Components own all Realtime subscriptions and interactive UI.

### Project Structure

```
chat-app/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   ├── (chat)/
│   │   ├── layout.tsx           ← Server Component, auth guard
│   │   ├── chat/page.tsx        ← empty state
│   │   └── chat/[userId]/page.tsx
│   ├── layout.tsx               ← root layout, SessionProvider
│   └── middleware.ts            ← Supabase session refresh
├── components/
│   ├── nav/                     NavSidebar, UserCard, SearchBar
│   ├── conversations/           ConversationList, ConversationItem
│   └── chat/                    ChatPanel, ChatHeader, MessageFeed,
│                                MessageBubble, MessageInput
├── lib/
│   └── supabase/
│       ├── client.ts            ← browser Supabase client
│       ├── server.ts            ← server Supabase client (SSR)
│       └── middleware.ts        ← session cookie refresh helper
├── hooks/
│   ├── useSession.ts            ← reads React Context session
│   ├── useMessages.ts           ← Realtime subscription
│   └── usePresence.ts           ← online/offline status
└── context/
    └── SessionContext.tsx       ← app-level session state
```

### Dual Session Management

```
SUPABASE LAYER                      APP LAYER
─────────────────────               ──────────────────────
• JWT stored in cookie              • React Context
• Refreshed by middleware           • Holds: userId,
  on every request                    displayName,
• Source of truth for auth            avatarUrl, email
• Enforces RLS on DB                • Populated once on load
                                    • Used via useSession()

Flow:
Login → Supabase Auth → cookie → middleware refreshes →
Server layout reads session → passes user to SessionContext →
Client components call useSession() (no extra DB fetch)
```

---

## Data Model

### Tables

**profiles**
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | references `auth.users(id)` |
| `display_name` | text NOT NULL | |
| `avatar_url` | text | nullable |
| `updated_at` | timestamptz | |

Created automatically via DB trigger on `auth.users` insert.

**messages**
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `sender_id` | uuid FK | → `profiles(id)` |
| `receiver_id` | uuid FK | → `profiles(id)` |
| `content` | text NOT NULL | |
| `created_at` | timestamptz | `default now()` |
| `read_at` | timestamptz | nullable — null = unread |

### Row Level Security

**profiles**
- SELECT: any authenticated user (needed for user list + search)
- UPDATE: owner only

**messages**
- SELECT: `auth.uid() = sender_id OR receiver_id`
- INSERT: `auth.uid() = sender_id`
- UPDATE: `auth.uid() = sender_id` (read_at updated via RPC)
- DELETE: not allowed

### Realtime Channels

```
DM channel (one per conversation pair):
  name: dm:{min(uid_a, uid_b)}:{max(uid_a, uid_b)}
  subscribes to: INSERT on messages (filtered by sender/receiver)

Presence channel (global):
  name: presence:online
  each client tracks their uid on join
  used for 🟢/🔴 status in sidebar and chat header
```

---

## Components & Data Flow

### Component Tree

```
app/layout.tsx  (Server)
└── SessionContext  (Client)
    ├── (auth)/login/page.tsx  (Client)
    │   └── LoginForm
    ├── (auth)/register/page.tsx  (Client)
    │   └── RegisterForm
    └── (chat)/layout.tsx  (Server — auth guard)
        ├── NavSidebar  (Client)
        │   ├── SearchBar
        │   ├── UserList → UserCard (avatar + name + 🟢/🔴)
        │   └── CurrentUser (avatar + name + settings)
        ├── ConversationList  (Client)
        │   └── ConversationItem (last message + time)
        └── chat/[userId]/page.tsx  (Server)
            └── ChatPanel  (Client)
                ├── ChatHeader (name + status)
                ├── MessageFeed (Realtime subscription)
                │   └── MessageBubble (sent | received)
                └── MessageInput (controlled + send)
```

### Data Flow

**Page load:**
1. Middleware refreshes Supabase session cookie
2. `(chat)/layout.tsx` reads session → redirect `/login` if missing
3. `chat/[userId]/page.tsx` fetches last 50 messages server-side
4. ChatPanel hydrates, opens Realtime DM channel
5. NavSidebar joins `presence:online` channel

**Sending a message:**
```
MessageInput
  → supabase.from('messages').insert(...)
  → Supabase writes row
  → Realtime broadcasts INSERT to both clients
  → MessageFeed appends new MessageBubble (both sides)
```

**Presence:**
```
On mount:  channel('presence:online').track({ userId })
On sync:   derive online ID set → usePresence(userId) → true/false
On leave:  browser close → Supabase auto-removes
```

---

## Error Handling

| Scenario | Handling |
|---|---|
| No session | Redirect `/login?error=session_expired` |
| Send failure | Inline error under input + retry button |
| Realtime disconnect | Auto-reconnect; toast "Reconnecting..." if > 3s |
| Profile fetch failure | Skeleton loaders (no blank UI) |
| RLS violation | 403 toast "Not authorized" |

---

## Testing

### Unit Tests (Vitest)
- `useSession` — returns correct user, handles null session
- `usePresence` — maps presence state to online/offline boolean
- `useMessages` — appends Realtime events correctly
- `buildChannelName` — deterministic regardless of uid order
- `MessageBubble` — sent vs received styles
- `ConversationItem` — unread indicator when `read_at` is null

### Integration Tests (Vitest + Supabase local dev)
- Auth flow: register → login → session cookie set
- RLS: user A cannot read messages between users B and C
- Message insert: `sender_id` cannot be spoofed
- Profile trigger: profile row created on `auth.users` insert

### Manual Golden Path (before PR)
1. Register two accounts in two browser tabs
2. Send DMs both ways — confirm real-time delivery
3. Close one tab — confirm 🔴 offline status appears
4. Reload — confirm message history persists
5. Access `/chat` unauthenticated — confirm redirect to `/login`

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14+ (App Router) |
| Auth + DB + Realtime | Supabase |
| Auth SSR helper | `@supabase/ssr` |
| Styling | Tailwind CSS |
| Tests | Vitest |
| Language | TypeScript |
