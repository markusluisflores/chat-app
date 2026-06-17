import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { UsernameForm } from '@/components/settings/UsernameForm'

export default async function SettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/login')

  return (
    <UsernameForm
      currentUserId={user.id}
      currentUsername={profile.username}
    />
  )
}
