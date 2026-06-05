'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const PRESENCE_CHANNEL = 'presence:online'

export function usePresence(currentUserId: string) {
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set())
  const supabase = createClient()

  useEffect(() => {
    const channel = supabase.channel(PRESENCE_CHANNEL)

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{ userId: string }>()
        const online = new Set(
          Object.values(state)
            .flat()
            .map((p) => p.userId)
        )
        setOnlineUsers(online)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ userId: currentUserId })
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [currentUserId])

  return {
    isOnline: (userId: string) => onlineUsers.has(userId),
    onlineUsers,
  }
}
