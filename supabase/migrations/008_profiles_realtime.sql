-- Enable Realtime CDC for profiles so username/display_name changes
-- are broadcast to subscribed clients via postgres_changes UPDATE events.
alter publication supabase_realtime add table public.profiles;
