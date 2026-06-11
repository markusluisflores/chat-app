import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ChatPanel } from '@/components/chat/ChatPanel'

type Props = {
  params: Promise<{ userId: string }>
}

export default async function ChatPage({ params }: Props) {
  const { userId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')
  if (userId === user.id) notFound()

  const { data: otherUser } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .eq('id', userId)
    .single()

  if (!otherUser) notFound()

  const { data: messages } = await supabase
    .from('messages')
    .select('*')
    .or(
      `and(sender_id.eq.${user.id},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${user.id})`
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
