'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { buildChannelName } from '@/lib/utils'
import type { Message } from '@/types'

export function useMessages(
  initialMessages: Message[],
  currentUserId: string,
  otherUserId: string
) {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const supabase = createClient()

  useEffect(() => {
    const channelName = buildChannelName(currentUserId, otherUserId)

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `sender_id=in.(${currentUserId},${otherUserId})`,
        },
        (payload) => {
          const incoming = payload.new as Message
          const isRelevant =
            (incoming.sender_id === currentUserId &&
              incoming.receiver_id === otherUserId) ||
            (incoming.sender_id === otherUserId &&
              incoming.receiver_id === currentUserId)

          if (isRelevant) {
            setMessages((prev) => [...prev, incoming])
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [currentUserId, otherUserId])

  return messages
}
