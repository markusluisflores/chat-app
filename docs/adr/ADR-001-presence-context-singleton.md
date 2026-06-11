# ADR-001: PresenceContext Singleton for Realtime Presence

**Date:** 2026-06-10
**Status:** Accepted

## Context and Problem Statement

Three components in the chat layout — `NavSidebar`, `ConversationList`, and `ChatPanel` — all need to know which users are online. Each needs to call `usePresence()` to read online state.

## Decision Drivers

* `createBrowserClient` from `@supabase/ssr` returns a singleton — the same Supabase client instance on every call in the browser
* `supabase.channel(topic)` reuses an existing channel if one with that topic is already in `supabase.realtime.channels` — it does not create a new instance
* Calling `.on('presence', ...)` on an already-subscribed channel throws: `cannot add presence callbacks after subscribe()`

## Considered Options

* **Per-component subscription** — each component calls `usePresence()` which internally calls `supabase.channel('presence:online')` and subscribes
* **PresenceContext (chosen)** — a single `PresenceProvider` creates one channel, holds state, and exposes `isOnline()` via React context; all consumers call `usePresence()` from the context

## Decision Outcome

**Chosen: PresenceContext** — because the Supabase browser client is a singleton and channels are reused by topic, making multiple concurrent subscriptions to the same topic structurally impossible. A single channel owned by a context provider is the only safe pattern.

### Consequences

* ✅ Single channel subscription, no duplicate-subscription errors
* ✅ Online state is consistent across all three consuming components
* ⚠️ `PresenceProvider` must wrap all consumers — currently placed in `app/(chat)/layout.tsx`
* ⚠️ Do NOT call `supabase.channel('presence:online')` in any component — always go through `usePresence()` from the context
