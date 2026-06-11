'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'

const PRESENCE_CHANNEL = 'presence:online'

type PresenceContextValue = {
  isOnline: (userId: string) => boolean
  onlineUsers: Set<string>
}

const PresenceContext = createContext<PresenceContextValue>({
  isOnline: () => false,
  onlineUsers: new Set(),
})

export function PresenceProvider({
  currentUserId,
  children,
}: {
  currentUserId: string
  children: ReactNode
}) {
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set())
  const supabase = createClient()

  useEffect(() => {
    const channel = supabase.channel(PRESENCE_CHANNEL, {
      config: { presence: { key: currentUserId } },
    })

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
      channel.teardown()
      ;(supabase.realtime as any)._remove(channel)
    }
  }, [currentUserId])

  return (
    <PresenceContext.Provider
      value={{
        isOnline: (userId) => onlineUsers.has(userId),
        onlineUsers,
      }}
    >
      {children}
    </PresenceContext.Provider>
  )
}

export function usePresence() {
  return useContext(PresenceContext)
}
