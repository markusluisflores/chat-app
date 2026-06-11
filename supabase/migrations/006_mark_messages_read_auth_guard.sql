-- Add auth.uid() guard so only the receiver can mark their own messages read.
-- Without this guard, any authenticated user could call the SECURITY DEFINER
-- function and clear read_at for a conversation they are not part of.
create or replace function public.mark_messages_read(p_sender_id uuid, p_receiver_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  if auth.uid() <> p_receiver_id then
    raise exception 'Not authorized';
  end if;

  update public.messages
  set read_at = now()
  where sender_id = p_sender_id
    and receiver_id = p_receiver_id
    and read_at is null;
end;
$$;
