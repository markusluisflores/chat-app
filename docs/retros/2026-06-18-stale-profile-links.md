# Retro: Stale Profile Links in ConversationList (Issue #12)

**Date filed:** 2026-06-18  
**Date resolved:** 2026-06-23  
**Type:** bug  
**Priority:** P2  
**Status:** resolved

---

## What Happened

When a user changed their username, other users' ConversationList showed the old username in the conversation link (`/chat/old-username`). Clicking it resulted in a 404. The link only updated after a full page reload.

## Root Cause

The `profiles` table was never added to the `supabase_realtime` publication. Supabase `postgres_changes` subscriptions only receive events for tables explicitly listed in the publication. The UPDATE listener in `ConversationList` for profile changes was silently receiving nothing — not an error, just zero events — so the in-memory profile data and conversation links were never updated.

The subscription code was written correctly; the missing piece was a single SQL statement applied to the Supabase project:

```sql
alter publication supabase_realtime add table public.profiles;
```

## What Went Wrong

- **Subscription appeared correct but fired nothing.** `postgres_changes` for a table not in the publication doesn't throw an error or log a warning — the channel subscribes successfully and events simply never arrive. This made it look like a code problem (wrong filter, wrong event type) rather than a configuration problem.

- **The publication state was never checked** when implementing the feature. The assumption was that any table could be subscribed to, which is not how Supabase Realtime works.

## What We Can Improve

- **When adding a new `postgres_changes` subscription to a table, verify the table is in the `supabase_realtime` publication first.** If events arrive → publication is set. If no events arrive despite correct code → check publication membership before debugging the subscription logic.

- **New table subscriptions require a migration.** Document this alongside ADR-001 (PresenceContext) as a required step when extending Realtime coverage to a new table.

## Action Items

| Item | Status |
|---|---|
| Add `profiles` to `supabase_realtime` publication | ✅ Done (migration 008, PR #15) |
| Document publication requirement in CLAUDE.md | Pending |
