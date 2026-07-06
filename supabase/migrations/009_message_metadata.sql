-- Enable moddatetime extension (Supabase includes it; this is idempotent)
create extension if not exists moddatetime schema extensions;

create table message_metadata (
  id              uuid primary key default gen_random_uuid(),
  message_id      uuid not null references messages(id) on delete cascade,
  url             text not null,
  og_title        text,
  og_description  text,
  og_image_url    text,
  status          text not null default 'pending',
  error           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  unique(message_id, url)
);

-- Auto-update updated_at on every UPDATE
create trigger handle_updated_at
  before update on message_metadata
  for each row execute procedure extensions.moddatetime(updated_at);

-- RLS
alter table message_metadata enable row level security;

-- SELECT: only message participants can read
create policy "Participants can read message metadata"
  on message_metadata for select
  using (
    exists (
      select 1 from messages m
      where m.id = message_metadata.message_id
        and (m.sender_id = auth.uid() or m.receiver_id = auth.uid())
    )
  );

-- No INSERT/UPDATE policy — service role bypasses RLS

-- Add to Realtime publication so clients receive INSERT and UPDATE events
alter publication supabase_realtime add table message_metadata;
