'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { usePathname } from 'next/navigation'
import type { RealtimePostgresInsertPayload, RealtimePostgresUpdatePayload } from '@supabase/supabase-js'
import type { Profile, Message } from '@/types'
import { ConversationItem } from './ConversationItem'
import { usePresence } from '@/hooks/usePresence'
import { createClient } from '@/lib/supabase/client'

type Props = {
  currentUserId: string
  profiles: Pick<Profile, 'id' | 'display_name' | 'avatar_url' | 'username'>[]
}

type ConversationSummary = {
  profile: Pick<Profile, 'id' | 'display_name' | 'avatar_url' | 'username'>
  lastMessage: Message
}

function sortByRecency(list: ConversationSummary[]): ConversationSummary[] {
  return [...list].sort(
    (a, b) =>
      new Date(b.lastMessage.created_at).getTime() -
      new Date(a.lastMessage.created_at).getTime()
  )
}

export function ConversationList({ currentUserId, profiles }: Props) {
  const pathname = usePathname()
  const { isOnline } = usePresence()
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [readTimestamps, setReadTimestamps] = useState<Map<string, string>>(new Map())
  // Holds the latest profile data for handleInsert lookups without adding profiles
  // to handleInsert's dependency array (which would teardown/resubscribe message channels).
  const profilesRef = useRef(profiles)
  const activeUsernameRef = useRef<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    const match = pathname.match(/^\/chat\/([^/]+)$/)
    activeUsernameRef.current = match ? match[1] : null
  }, [pathname])

  useEffect(() => {
    async function load() {
      const { data: messages } = await supabase
        .from('messages')
        .select('*')
        .or(`sender_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`)
        .order('created_at', { ascending: false })
        .limit(500)

      const lastByUser = new Map<string, Message>()
      for (const msg of messages ?? []) {
        const otherId =
          msg.sender_id === currentUserId ? msg.receiver_id : msg.sender_id
        if (!lastByUser.has(otherId)) lastByUser.set(otherId, msg)
      }

      const summaries: ConversationSummary[] = []
      for (const profile of profiles) {
        const lastMessage = lastByUser.get(profile.id)
        if (lastMessage) summaries.push({ profile, lastMessage })
      }

      setConversations(sortByRecency(summaries))
    }

    load()
  }, [currentUserId, profiles])

  const handleInsert = useCallback(
    (payload: RealtimePostgresInsertPayload<Message>) => {
      const msg = payload.new
      const otherId =
        msg.sender_id === currentUserId ? msg.receiver_id : msg.sender_id
      // Use ref so profile username changes don't require re-subscribing message channels
      const profile = profilesRef.current.find((p) => p.id === otherId)
      if (!profile) return

      setConversations((prev) => {
        const without = prev.filter((c) => c.profile.id !== otherId)
        return [{ profile, lastMessage: msg }, ...without]
      })

      if (activeUsernameRef.current === profile.username) {
        setReadTimestamps((prev) => new Map([...prev, [otherId, msg.created_at]]))
      }
    },
    [currentUserId]
  )

  useEffect(() => {
    const profilesChannel = supabase
      .channel(`profiles-${currentUserId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        (payload: RealtimePostgresUpdatePayload<Pick<Profile, 'id' | 'display_name' | 'avatar_url' | 'username'>>) => {
          const updated = payload.new
          profilesRef.current = profilesRef.current.map((p) =>
            p.id === updated.id ? { ...p, ...updated } : p
          )
          setConversations((prev) =>
            prev.map((c) =>
              c.profile.id === updated.id ? { ...c, profile: { ...c.profile, ...updated } } : c
            )
          )
        }
      )
      .subscribe()

    return () => {
      profilesChannel.teardown()
      ;(supabase.realtime as unknown as { _remove: (ch: typeof profilesChannel) => void })._remove(profilesChannel)
    }
  }, [currentUserId])

  useEffect(() => {
    const sentChannel = supabase
      .channel(`conv-sent-${currentUserId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `sender_id=eq.${currentUserId}`,
      }, handleInsert)
      .subscribe()

    const rcvdChannel = supabase
      .channel(`conv-rcvd-${currentUserId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `receiver_id=eq.${currentUserId}`,
      }, handleInsert)
      .subscribe()

    return () => {
      sentChannel.teardown()
      ;(supabase.realtime as unknown as { _remove: (ch: typeof sentChannel) => void })._remove(sentChannel)
      rcvdChannel.teardown()
      ;(supabase.realtime as unknown as { _remove: (ch: typeof rcvdChannel) => void })._remove(rcvdChannel)
    }
  }, [currentUserId, handleInsert])

  return (
    <aside className="w-[300px] flex-shrink-0 flex flex-col border-r border-gray-100">
      <div className="p-4 border-b border-gray-100">
        <h2 className="font-semibold text-gray-800">Open</h2>
      </div>
      <div className="flex-1 overflow-y-auto">
        {conversations.map(({ profile, lastMessage }) => {
          const lastSeenAt = readTimestamps.get(profile.id)
          const isRead = lastSeenAt !== undefined && lastSeenAt >= lastMessage.created_at
          return (
            <ConversationItem
              key={profile.id}
              user={profile}
              lastMessage={lastMessage}
              isOnline={isOnline(profile.id)}
              isActive={pathname === `/chat/${profile.username}`}
              isRead={isRead}
              currentUserId={currentUserId}
              onOpen={() =>
                setReadTimestamps((prev) => new Map([...prev, [profile.id, lastMessage.created_at]]))
              }
            />
          )
        })}
      </div>
    </aside>
  )
}
