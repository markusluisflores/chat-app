import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ChatPanel } from '@/components/chat/ChatPanel'

type Props = {
  params: Promise<{ username: string }>
}

export default async function ChatPage({ params }: Props) {
  const { username } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: otherUser } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url, username')
    .eq('username', username)
    .single()

  if (!otherUser) notFound()
  if (otherUser.id === user.id) notFound()

  const { data: messages } = await supabase
    .from('messages')
    .select('*')
    .or(
      `and(sender_id.eq.${user.id},receiver_id.eq.${otherUser.id}),and(sender_id.eq.${otherUser.id},receiver_id.eq.${user.id})`
    )
    .order('created_at', { ascending: true })
    .limit(50)

  return (
    <ChatPanel
      currentUserId={user.id}
      otherUser={otherUser}
      initialMessages={messages ?? []}
    />
  )
}
