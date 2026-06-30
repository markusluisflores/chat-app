'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
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
  // Set of profile IDs whose conversations have been read this session.
  // Initialized from read_at on load; updated as user opens/receives messages.
  const [readConversations, setReadConversations] = useState<Set<string>>(new Set())
  const profilesRef = useRef(profiles)
  const activeUsernameRef = useRef<string | null>(null)
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    const match = pathname.match(/^\/chat\/([^/]+)$/)
    activeUsernameRef.current = match ? match[1] : null
  }, [pathname])

  useEffect(() => {
    profilesRef.current = profiles
  }, [profiles])

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
      for (const profile of profilesRef.current) {
        const lastMessage = lastByUser.get(profile.id)
        if (lastMessage) summaries.push({ profile, lastMessage })
      }

      setConversations(sortByRecency(summaries))

      // A conversation starts as read if current user sent the last message,
      // or if the DB shows it was already marked read.
      const initialRead = new Set<string>()
      for (const { profile, lastMessage } of summaries) {
        if (lastMessage.sender_id === currentUserId || lastMessage.read_at !== null) {
          initialRead.add(profile.id)
        }
      }
      setReadConversations(initialRead)
    }

    load()
    // profiles intentionally omitted: profilesRef.current is used inside so load() only
    // runs on mount, preventing readConversations from being reset on every navigation.
  }, [currentUserId, supabase])

  const handleInsert = useCallback(
    (payload: RealtimePostgresInsertPayload<Message>) => {
      const msg = payload.new
      const otherId =
        msg.sender_id === currentUserId ? msg.receiver_id : msg.sender_id
      const profile = profilesRef.current.find((p) => p.id === otherId)
      if (!profile) return

      setConversations((prev) => {
        const without = prev.filter((c) => c.profile.id !== otherId)
        return [{ profile, lastMessage: msg }, ...without]
      })

      // Mark as unread only if the other person sent it and we're not in their conversation.
      if (msg.sender_id === otherId && activeUsernameRef.current !== profile.username) {
        setReadConversations((prev) => {
          const next = new Set(prev)
          next.delete(otherId)
          return next
        })
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
  }, [currentUserId, supabase])

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
  }, [currentUserId, handleInsert, supabase])

  return (
    <aside className="w-[300px] flex-shrink-0 flex flex-col border-r border-gray-100">
      <div className="p-4 border-b border-gray-100">
        <h2 className="font-semibold text-gray-800">Open</h2>
      </div>
      <div className="flex-1 overflow-y-auto">
        {conversations.map(({ profile, lastMessage }) => {
          const isRead =
            lastMessage.sender_id === currentUserId ||
            readConversations.has(profile.id)
          return (
            <ConversationItem
              key={profile.id}
              user={profile}
              lastMessage={lastMessage}
              isOnline={isOnline(profile.id)}
              isActive={pathname === `/chat/${profile.username}`}
              isRead={isRead}
              onOpen={() =>
                setReadConversations((prev) => new Set([...prev, profile.id]))
              }
            />
          )
        })}
      </div>
    </aside>
  )
}
