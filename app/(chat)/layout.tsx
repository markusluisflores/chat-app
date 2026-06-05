import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { NavSidebar } from '@/components/nav/NavSidebar'
import { ConversationList } from '@/components/conversations/ConversationList'

export default async function ChatLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url')
    .neq('id', user.id)
    .order('display_name')

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <NavSidebar currentUserId={user.id} profiles={profiles ?? []} />
      <ConversationList currentUserId={user.id} profiles={profiles ?? []} />
      <main className="flex-1 flex flex-col overflow-hidden">{children}</main>
    </div>
  )
}
