'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import type { Profile, Message } from '@/types'
import { ConversationItem } from './ConversationItem'
import { usePresence } from '@/hooks/usePresence'
import { createClient } from '@/lib/supabase/client'

type Props = {
  currentUserId: string
  profiles: Pick<Profile, 'id' | 'display_name' | 'avatar_url'>[]
}

type ConversationSummary = {
  profile: Pick<Profile, 'id' | 'display_name' | 'avatar_url'>
  lastMessage: Message | null
}

export function ConversationList({ currentUserId, profiles }: Props) {
  const pathname = usePathname()
  const { isOnline } = usePresence(currentUserId)
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: messages } = await supabase
        .from('messages')
        .select('*')
        .or(`sender_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`)
        .order('created_at', { ascending: false })

      const lastByUser = new Map<string, Message>()
      for (const msg of messages ?? []) {
        const otherId =
          msg.sender_id === currentUserId ? msg.receiver_id : msg.sender_id
        if (!lastByUser.has(otherId)) lastByUser.set(otherId, msg)
      }

      const summaries: ConversationSummary[] = profiles.map((profile) => ({
        profile,
        lastMessage: lastByUser.get(profile.id) ?? null,
      }))

      summaries.sort((a, b) => {
        if (!a.lastMessage && !b.lastMessage) return 0
        if (!a.lastMessage) return 1
        if (!b.lastMessage) return -1
        return (
          new Date(b.lastMessage.created_at).getTime() -
          new Date(a.lastMessage.created_at).getTime()
        )
      })

      setConversations(summaries)
    }

    load()
  }, [currentUserId, profiles])

  return (
    <aside className="w-[300px] flex-shrink-0 flex flex-col border-r border-gray-100">
      <div className="p-4 border-b border-gray-100">
        <h2 className="font-semibold text-gray-800">Open</h2>
      </div>
      <div className="flex-1 overflow-y-auto">
        {conversations.map(({ profile, lastMessage }) => (
          <ConversationItem
            key={profile.id}
            user={profile}
            lastMessage={lastMessage}
            isOnline={isOnline(profile.id)}
            isActive={pathname === `/chat/${profile.id}`}
          />
        ))}
      </div>
    </aside>
  )
}
