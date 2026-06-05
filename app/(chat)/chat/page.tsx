import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function ChatEmptyPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <div className="flex-1 flex items-center justify-center">
      <p className="text-gray-400 text-sm">Select a contact to start chatting</p>
    </div>
  )
}
