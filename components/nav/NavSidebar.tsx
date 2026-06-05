'use client'

import type { Profile } from '@/types'

type Props = {
  currentUserId: string
  profiles: Pick<Profile, 'id' | 'display_name' | 'avatar_url'>[]
}

export function NavSidebar({ currentUserId, profiles }: Props) {
  return (
    <aside className="w-[220px] flex-shrink-0 flex flex-col border-r border-gray-100 bg-gray-50">
      <div className="p-4 border-b border-gray-100">
        <h1 className="font-bold text-lg text-blue-600">ChatApp</h1>
      </div>
      <div className="flex-1 p-4 text-sm text-gray-400">
        {profiles.length} contacts
      </div>
    </aside>
  )
}
