-- RPC to mark messages as read by the receiver.
-- Direct UPDATE policy only allows senders to update — this RPC runs with
-- security definer so the receiver can mark messages read without violating RLS.
create or replace function public.mark_messages_read(p_sender_id uuid, p_receiver_id uuid)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  update public.messages
  set read_at = now()
  where sender_id = p_sender_id
    and receiver_id = p_receiver_id
    and read_at is null;
end;
$$;
