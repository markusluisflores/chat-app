'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Props = {
  currentUserId: string
  otherUserId: string
}

export function MessageInput({ currentUserId, otherUserId }: Props) {
  const [content, setContent] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)
  const supabase = createClient()

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!content.trim()) return

    setIsSending(true)
    setError(null)

    // Supabase RLS policy messages_insert_as_sender enforces
    // auth.uid() = sender_id — this insert will be rejected by the
    // database if sender_id doesn't match the authenticated user.
    const { error } = await supabase.from('messages').insert({
      sender_id: currentUserId,
      receiver_id: otherUserId,
      content: content.trim(),
    })

    if (error) {
      setError('Failed to send. Try again.')
      setIsSending(false)
      return
    }

    setContent('')
    setIsSending(false)
  }

  return (
    <div className="px-4 py-3 border-t border-gray-100">
      {error && (
        <p className="text-xs text-red-500 mb-1">
          {error}{' '}
          <button className="underline" onClick={() => setError(null)}>
            Dismiss
          </button>
        </p>
      )}
      <form onSubmit={handleSend} className="flex gap-2">
        <input
          type="text"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Write a message..."
          className="flex-1 px-4 py-2 border border-gray-200 rounded-full text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={isSending || !content.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded-full text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  )
}
