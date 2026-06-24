# Retro: Unread Bold Indicator Not Clearing (Issue #13)

**Date:** 2026-06-18  
**Type:** incident  
**Status:** resolved

---

## What Went Right

- User caught the regressions quickly during manual testing — clear, specific feedback ("once I click another chat, the old chat returns to bold") made root cause diagnosis fast
- The final `readTimestamps Map` solution handles all five edge cases correctly and is clean — no hacks, no hidden state, no lint violations
- The bug skill update (Step 4b) was made in the same session as the bug was filed, so the retro obligation survived the session boundary and was actioned correctly
- `activeUsernameRef` pattern correctly avoided the channel teardown/resubscribe problem that would have been caused by adding `pathname` to `handleInsert`'s dependency array
- 43 tests passing at time of merge, including 3 new tests specifically covering the edge cases that previously failed

## What Went Wrong

- **Three fix iterations were needed** instead of one. Each iteration uncovered an edge case that should have been identified upfront:
  1. Attempt 1 (`isActive` suppression): clears bold while viewing, but navigating away restores `isActive=false` with stale `read_at: null` — bold returns
  2. Attempt 2 (`readUserIds Set`): persists "opened" state, but new messages after reading never re-bold because the user ID stays in the set
  3. Attempt 3 (`readTimestamps Map`): correct — stores the `created_at` of the last message seen; new messages with a later timestamp fall outside the window and re-bold correctly

- **Root cause of the iterations:** No edge case enumeration was done before implementation. The problem was approached as "suppress bold when opened" rather than "bold = (new message exists that the user hasn't seen yet)." The correct mental model makes all five cases obvious.

- **Contributing factor:** `read_at` in the database is only written by `mark_messages_read` RPC, not by Realtime subscriptions (INSERT only). This means `read_at` on the incoming Realtime message is always `null` — the in-memory tracking layer (`readTimestamps`) is the only source of truth for whether the current session user has seen a message. This constraint wasn't articulated before implementation, which is why the first two attempts leaned on `read_at` implicitly.

## What We Can Improve

- Before implementing any "read/unread" or "seen/unseen" state, enumerate the full edge case matrix explicitly:
  1. New message, never opened → should bold
  2. Open the conversation → bold clears
  3. Navigate away → stays non-bold
  4. New message arrives after reading → re-bolds
  5. New message arrives while actively viewing → never bolds, stays non-bold after navigating away

  If all five can't be satisfied by the proposed approach, don't start implementing.

- When a feature interacts with Realtime (INSERT-only), note explicitly that `read_at`/`updated_at` fields on incoming payloads will always be `null` — in-memory state is the only option for tracking session-local read status.

## Action Items

| Item | Status |
|---|---|
| Fix issue #12 (P2): username change breaks ConversationList links for other online users | Pending |
| Replace plain `<img>` tags with `next/image` in ChatHeader, ConversationItem, UserCard | Pending |
