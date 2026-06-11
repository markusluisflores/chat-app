# ADR-005: Realtime Channel Cleanup via teardown() + _remove()

**Date:** 2026-06-10
**Status:** Accepted

## Context and Problem Statement

React Strict Mode double-invokes `useEffect` (mount → unmount → remount) in development. When a Realtime channel is subscribed in a `useEffect`, the cleanup function runs between the two mounts. If the channel is still present in Supabase's internal channel list when the second mount runs, calling `.channel(topic)` returns the already-subscribed instance and `.on()` throws: `cannot add callbacks after subscribe()`.

## Decision Drivers

* `supabase.removeChannel(channel)` is async — it calls `unsubscribe()` on the Phoenix socket and awaits the response. The channel remains in `supabase.realtime.channels` during the await, long enough for React Strict Mode's second mount to retrieve it
* The channel must be synchronously removed from the internal array before the cleanup function returns

## Considered Options

* **`supabase.removeChannel(channel)`** — official API, async, leaves channel in internal array during await, fails under Strict Mode
* **`channel.unsubscribe()`** — unsubscribes the socket but does not remove the channel from the internal array
* **`channel.teardown()` + `_remove()` (chosen)** — `teardown()` synchronously resets the Phoenix channel state to `closed`; `(supabase.realtime as any)._remove(channel)` synchronously removes it from the internal array

## Decision Outcome

**Chosen: `teardown()` + `_remove()`** — because it synchronously removes the channel from all internal state before the cleanup function returns, preventing the Strict Mode double-invoke from finding a stale subscribed channel.

### Consequences

* ✅ No `cannot add callbacks after subscribe()` errors in development or production
* ✅ Works correctly under React Strict Mode
* ⚠️ `_remove` is a private API — prefix `(supabase.realtime as any)._remove(channel)` is required; may break on major Supabase JS upgrades
* ⚠️ Apply this pattern in every `useEffect` that subscribes a Realtime channel (`useMessages`, any future hooks)
