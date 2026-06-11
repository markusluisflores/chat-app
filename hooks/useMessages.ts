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

    // Supabase Realtime postgres_changes respects Row Level Security:
    // only rows matching the authenticated user's RLS SELECT policy are broadcast.
    // Our messages_select_participant policy ensures only messages where
    // auth.uid() = sender_id OR receiver_id are ever sent to this client.
    // The JS-side isRelevant guard below is a second layer of defense.
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
          // Guard: only append messages strictly between this pair of users.
          const isRelevant =
            (incoming.sender_id === currentUserId &&
              incoming.receiver_id === otherUserId) ||
            (incoming.sender_id === otherUserId &&
              incoming.receiver_id === currentUserId)

          if (isRelevant) {
            setMessages((prev) => {
              // Deduplicate by id to handle any SSR/Realtime overlap.
              if (prev.some((m) => m.id === incoming.id)) return prev
              return [...prev, incoming]
            })
          }
        }
      )
      .subscribe()

    // Mark messages from otherUser as read when conversation opens
    supabase.rpc('mark_messages_read', {
      p_sender_id: otherUserId,
      p_receiver_id: currentUserId,
    })

    return () => {
      channel.teardown()
      ;(supabase.realtime as any)._remove(channel)
    }
  }, [currentUserId, otherUserId])

  return messages
}
