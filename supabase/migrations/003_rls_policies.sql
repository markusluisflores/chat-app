-- profiles: any authenticated user can read all profiles (needed for user list + search)
create policy "profiles_select_authenticated"
  on public.profiles for select
  to authenticated
  using (true);

-- profiles: only the owner can update their own profile
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

-- messages: only participants can read
create policy "messages_select_participant"
  on public.messages for select
  to authenticated
  using (auth.uid() = sender_id or auth.uid() = receiver_id);

-- messages: only the sender can insert (and sender_id must equal their uid)
create policy "messages_insert_as_sender"
  on public.messages for insert
  to authenticated
  with check (auth.uid() = sender_id);

-- messages: only the sender can update (read_at updated via RPC, not direct UPDATE)
create policy "messages_update_as_sender"
  on public.messages for update
  to authenticated
  using (auth.uid() = sender_id);
