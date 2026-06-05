create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  display_name text not null,
  avatar_url text,
  updated_at timestamptz default now()
);

alter table public.profiles enable row level security;
