# ADR-004: Security-Definer RPC for Marking Messages Read

**Date:** 2026-06-10
**Status:** Accepted

## Context and Problem Statement

When a user opens a conversation, messages sent to them should be marked as read. The `messages` table has an UPDATE RLS policy that only allows the sender (`auth.uid() = sender_id`) to modify their own messages. The receiver needs to update `read_at` on messages they received — but doing so would violate the sender-only UPDATE policy.

## Decision Drivers

* RLS must remain enabled — disabling it to allow receiver updates would expose all messages to all users
* Expanding the UPDATE policy to include receivers (`auth.uid() = receiver_id`) would allow receivers to modify message content, not just `read_at`
* The read-receipt update must be atomic and authorized server-side

## Considered Options

* **Expand UPDATE policy to include receiver** — allows receiver to update any column on received messages, including content
* **Separate `read_receipts` table** — receiver inserts a row; joins required for every message query
* **Security-definer RPC (chosen)** — `mark_messages_read(p_sender_id, p_receiver_id)` runs with elevated privileges, updates only `read_at`, enforces that the caller is the receiver

## Decision Outcome

**Chosen: Security-definer RPC** — because it grants the minimum required privilege (update `read_at` only) to the right party (the receiver) without loosening the general UPDATE policy or adding a separate table.

### Consequences

* ✅ Receiver can mark messages read without violating sender-only UPDATE policy
* ✅ RLS remains enabled and restrictive
* ✅ Function enforces `auth.uid() = p_receiver_id` — cannot be called on behalf of another user
* ⚠️ `SECURITY DEFINER` functions bypass RLS — the function body must be carefully scoped to only the intended operation
