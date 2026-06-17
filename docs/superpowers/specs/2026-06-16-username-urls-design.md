# Username URLs — Design Spec

**Date:** 2026-06-16
**Status:** Approved

## Problem

Chat URLs currently use raw UUIDs (`/chat/aaaaaaaa-aaaa-aaaa-aaaa-000000000002`). The URL is visible in the address bar and provides no context about who you are chatting with.

## Goal

Replace the UUID segment with a human-readable username so URLs read as `/chat/alice`. The URL provides context to the user; it is not treated as a shareable permalink, so broken links when a username changes are acceptable.

---

## Section 1: Database

### New column

```sql
ALTER TABLE public.profiles
  ADD COLUMN username text unique not null
  CONSTRAINT username_format CHECK (username ~ '^[a-z0-9_-]{3,30}$');
```

**Format rules:**
- 3–30 characters
- Lowercase letters, digits, hyphens, underscores only (`^[a-z0-9_-]{3,30}$`)
- Unique across all profiles

**Reserved words** (blocked at the app level, not the DB):
`login`, `register`, `chat`, `api`, `auth`

### Backfill for existing users

Existing users get a username derived from the email local part:
1. Lowercase the local part
2. Replace any character not in `[a-z0-9_-]` with `-`
3. Trim to 30 characters
4. If the result conflicts, append `-2`, `-3`, etc.

Existing users can change their username via the settings page after launch.

### Trigger update

`handle_new_user()` reads `username` from `raw_user_meta_data.username`. No email-derivation fallback at the trigger level — the registration form always provides it.

```sql
INSERT INTO public.profiles (id, display_name, avatar_url, username)
VALUES (
  new.id,
  coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
  new.raw_user_meta_data->>'avatar_url',
  new.raw_user_meta_data->>'username'
);
```

---

## Section 2: Registration Form

A `username` field is added to `RegisterForm` between display name and email.

**Field order:**
1. Display name
2. Username ← new
3. Email
4. Password

**Client-side validation** (before API call):
- Regex: `^[a-z0-9_-]{3,30}$`
- Reserved words: `login`, `register`, `chat`, `api`, `auth`
- Inline hint: "3–30 characters · lowercase letters, numbers, `-` and `_` only"

**On submit:** username is passed in `options.data` alongside `display_name`:

```ts
await supabase.auth.signUp({
  email,
  password,
  options: { data: { display_name: displayName, username } },
})
```

**Server-side error:** Postgres error code `23505` (unique violation) → display "Username is already taken" inline.

---

## Section 3: Routing & Links

### Route rename

`app/(chat)/chat/[userId]/page.tsx` → `app/(chat)/chat/[username]/page.tsx`

### Page server component

Query by username to resolve the profile:

```ts
const { data: otherUser } = await supabase
  .from('profiles')
  .select('id, display_name, avatar_url, username')
  .eq('username', params.username)
  .single()

if (!otherUser) notFound()
```

`otherUser.id` is used for all downstream operations (messages query, ChatPanel props). No changes inside ChatPanel or useMessages.

### Self-chat guard

```ts
if (params.username === currentUserUsername) notFound()
```

### Type update

```ts
export type Profile = {
  id: string
  display_name: string
  avatar_url: string | null
  updated_at: string | null
  username: string  // ← new
}
```

### Layout query

Include `username` in the profiles select:

```ts
supabase.from('profiles').select('id, display_name, avatar_url, username')
```

### Link updates

Two components generate chat URLs — both switch from `profile.id` to `profile.username`:

| Component | Before | After |
|---|---|---|
| `ConversationItem` | `href="/chat/${profile.id}"` | `href="/chat/${profile.username}"` |
| `UserCard` | `href="/chat/${profile.id}"` | `href="/chat/${profile.username}"` |

All component prop types that carry profiles must include `username` in their `Pick<Profile, ...>`.

---

## Section 4: Profile Settings Page

### Route

`app/(chat)/settings/page.tsx` — protected by the existing `(chat)` layout, no extra auth needed.

### UI

```
┌─────────────────────────────────┐
│  Settings                       │
│                                 │
│  Username                       │
│  [alice________________]        │
│  3–30 chars · a–z, 0–9, - _    │
│                                 │
│  [Save]                         │
│                                 │
│  ✓ Username updated  (on save)  │
└─────────────────────────────────┘
```

### Behaviour

- Input pre-filled with the user's current username from session
- Nothing changes in the DB until Save is clicked — the original username stays active and the existing chat URL keeps working until the moment the save completes
- On save: `supabase.from('profiles').update({ username }).eq('id', currentUserId)`
- Duplicate username → inline "Username is already taken"
- Success → inline "Username updated" confirmation; user stays on the settings page

### NavSidebar entry point

"Settings" link added to the footer between the user's name and "Sign out":

```
[M] Markus  Settings  Sign out
```

---

## Decisions

| Question | Chosen | Why | Tradeoff accepted |
|---|---|---|---|
| Username source | User-chosen at registration | Auto-derived from email produces ugly handles for unusual emails | Extra form field at signup |
| Changeability | Changeable via settings page | Users may want to update their handle | Old chat URLs silently break; acceptable since URLs are context, not permalinks |
| Conflict on change | Inline error, user picks another | Simpler than auto-suffix for intentional user choice | User must try again manually |
| Reserved word blocking | App-level check | Short fixed list; no need for DB constraint | Must keep list in sync manually if new routes are added |
| Settings page scope | Username only | YAGNI — only feature needed right now | No display name or avatar editing in this pass |
