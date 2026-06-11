create table public.messages (
  id uuid default gen_random_uuid() primary key,
  sender_id uuid references public.profiles(id) on delete cascade not null,
  receiver_id uuid references public.profiles(id) on delete cascade not null,
  content text not null,
  created_at timestamptz default now() not null,
  read_at timestamptz
);

alter table public.messages enable row level security;

-- Enable Realtime for this table
alter publication supabase_realtime add table public.messages;
