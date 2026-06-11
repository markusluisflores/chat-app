'use client'

import type { Profile, Message } from '@/types'
import { ChatHeader } from './ChatHeader'
import { MessageFeed } from './MessageFeed'
import { MessageInput } from './MessageInput'
import { usePresence } from '@/hooks/usePresence'

type Props = {
  currentUserId: string
  otherUser: Pick<Profile, 'id' | 'display_name' | 'avatar_url'>
  initialMessages: Message[]
}

export function ChatPanel({ currentUserId, otherUser, initialMessages }: Props) {
  const { isOnline } = usePresence()

  return (
    <div className="flex flex-col h-full">
      <ChatHeader user={otherUser} isOnline={isOnline(otherUser.id)} />
      <MessageFeed
        initialMessages={initialMessages}
        currentUserId={currentUserId}
        otherUserId={otherUser.id}
      />
      <MessageInput currentUserId={currentUserId} otherUserId={otherUser.id} />
    </div>
  )
}
