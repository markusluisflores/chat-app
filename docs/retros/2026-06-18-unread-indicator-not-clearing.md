# Retro: Unread Bold Indicator Not Clearing (Issue #13)

**Date filed:** 2026-06-18  
**Date resolved:** 2026-06-23  
**Type:** incident  
**Status:** resolved

---

## What Went Right

- User caught regressions quickly during manual testing — clear, specific feedback made root cause diagnosis achievable
- `activeUsernameRef` pattern correctly avoided channel teardown/resubscribe that adding `pathname` to `handleInsert`'s dep array would have caused
- The bug skill Step 4b update (save retro obligation at filing time) worked — the retro requirement survived the session boundary and was actioned
- Playwright E2E tests were added as part of the fix, giving a regression suite for this exact behavior going forward

## What Went Wrong

**Four fix iterations were needed instead of one.** Each round uncovered a different layer of the same bug:

1. **Attempt 1 — `isActive` suppression:** Clears bold while viewing, but navigating away restores `isActive=false` with stale `read_at: null` in DB — bold returns immediately.

2. **Attempt 2 — `readUserIds Set`:** Persists "opened" state in memory but new messages after reading never re-bold because the profile ID stays in the set permanently.

3. **Attempt 3 — `readTimestamps Map`:** Correct for in-session behavior, but refresh still re-bolded everything. Retro was written at this point (2026-06-18) assuming the fix was done — it wasn't.

4. **Root cause finally found (2026-06-23):** `PostgrestBuilder` from `@supabase/postgrest-js` is **lazy** — the HTTP `fetch` only fires when `.then()` is consumed on the builder. `supabase.rpc('mark_messages_read', ...)` was called without `.then()` at both call sites in `useMessages.ts`, so `read_at` was never written to the DB. Every page refresh re-read `null` values and showed all conversations as bold. This is why fixing the in-memory state (Attempts 1–3) never fixed the refresh case — the DB was never updated.

**A second unrelated root cause was also present:** The `(chat)` layout is a dynamic server component (calls `supabase.auth.getUser()` which reads cookies). Next.js re-renders it on every navigation, sending a new `profiles` array reference each time. That reference was in `load()`'s dependency array, which caused `load()` to re-run on every conversation switch and call `setReadConversations(initialRead)`, wiping all in-session read state. This manifested as the "switch conversations causes bold" regression.

**Contributing factor:** `PostgrestBuilder`'s lazy evaluation is a non-obvious footgun. `supabase.rpc()` looks like a function call but returns a builder object that does nothing until `.then()` is called. No TypeScript error, no runtime warning — the call site looks correct and the unit tests passed (because `vi.fn().mockResolvedValue()` creates an eager Promise, not a lazy builder, masking the divergence from real behavior).

## What We Can Improve

- **Always `await` or chain `.then()` on Supabase query builders**, especially for fire-and-forget calls. `supabase.rpc()`, `supabase.from().insert()`, etc. are lazy — dropping the result silently discards the HTTP request.

- **Unit test mocks should match the real implementation's execution model.** `vi.fn().mockResolvedValue()` creates an eager Promise; `PostgrestBuilder` is lazy. The mismatch means tests pass for code that never fires the network request. Use a lazy builder mock (one that only resolves when `.then()` is called) when testing fire-and-forget Supabase calls.

- **Dynamic Next.js layouts re-render on every navigation.** Any array/object prop passed from a dynamic server layout will be a new reference on each route change. Never put such a prop directly in a `useEffect` dependency array if re-running the effect on every navigation is undesirable. Use a `ref` to hold the latest value instead.

- **Before writing the retro, verify the fix holds across all reported symptoms** — refresh AND switch-conversations. Writing the retro after only verifying one symptom left a second root cause undiscovered for another session.

## Action Items

| Item | Status |
|---|---|
| Fix issue #12 (P2): profiles table missing from realtime publication | ✅ Done (migration 008, PR #15) |
| Fix issue #13 refresh case: `mark_messages_read` RPC not firing | ✅ Done (`.then()` fix, PR #15) |
| Fix issue #13 switch-conversations case: `profiles` in `load()` dep array | ✅ Done (profilesRef pattern, PR #15) |
| Replace plain `<img>` tags with `next/image` in ChatHeader, ConversationItem, UserCard | Pending |
