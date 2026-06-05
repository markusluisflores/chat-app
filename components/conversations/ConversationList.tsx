'use client'

import type { Profile } from '@/types'

type Props = {
  currentUserId: string
  profiles: Pick<Profile, 'id' | 'display_name' | 'avatar_url'>[]
}

export function ConversationList({ currentUserId, profiles }: Props) {
  return (
    <aside className="w-[300px] flex-shrink-0 flex flex-col border-r border-gray-100">
      <div className="p-4 border-b border-gray-100">
        <h2 className="font-semibold text-gray-800">Open</h2>
      </div>
      <div className="flex-1 p-4 text-sm text-gray-400">
        {profiles.length} conversations
      </div>
    </aside>
  )
}
