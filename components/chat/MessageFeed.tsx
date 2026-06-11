'use client'

import { useEffect, useRef } from 'react'
import type { Message } from '@/types'
import { MessageBubble } from './MessageBubble'
import { useMessages } from '@/hooks/useMessages'

type Props = {
  initialMessages: Message[]
  currentUserId: string
  otherUserId: string
}

export function MessageFeed({ initialMessages, currentUserId, otherUserId }: Props) {
  const messages = useMessages(initialMessages, currentUserId, otherUserId)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          isSent={message.sender_id === currentUserId}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
