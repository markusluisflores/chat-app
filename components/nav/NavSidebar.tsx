'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Profile } from '@/types'
import { UserCard } from './UserCard'
import { usePresence } from '@/hooks/usePresence'
import { useSession } from '@/hooks/useSession'
import { createClient } from '@/lib/supabase/client'

type Props = {
  currentUserId: string
  profiles: Pick<Profile, 'id' | 'display_name' | 'avatar_url'>[]
}

export function NavSidebar({ currentUserId, profiles }: Props) {
  const [search, setSearch] = useState('')
  const { isOnline } = usePresence(currentUserId)
  const { session } = useSession()
  const supabase = createClient()
  const router = useRouter()

  const filtered = profiles.filter((p) =>
    p.display_name.toLowerCase().includes(search.toLowerCase())
  )

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className="w-[220px] flex-shrink-0 flex flex-col border-r border-gray-100 bg-gray-50">
      <div className="p-4 border-b border-gray-100">
        <h1 className="font-bold text-lg text-blue-600">ChatApp</h1>
      </div>
      <div className="p-3">
        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        <p className="px-4 py-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Contacts
        </p>
        {filtered.map((profile) => (
          <UserCard
            key={profile.id}
            profile={profile}
            isOnline={isOnline(profile.id)}
          />
        ))}
      </div>
      <div className="p-3 border-t border-gray-100 flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
          {session?.displayName?.[0]?.toUpperCase() ?? '?'}
        </div>
        <span className="text-sm text-gray-700 truncate flex-1">
          {session?.displayName}
        </span>
        <button
          onClick={handleSignOut}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          Out
        </button>
      </div>
    </aside>
  )
}
