'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { OgMetadata } from '@/worker/processors/link-preview'

export function useLinkPreviews(messageIds: string[]): Map<string, OgMetadata> {
  const [previews, setPreviews] = useState<Map<string, OgMetadata>>(new Map())
  const supabase = createClient()
  // Stable channel name per hook instance — avoids topic collisions on remount
  const channelRef = useRef(`link-previews:${Math.random().toString(36).slice(2)}`)
  const idsKey = messageIds.join(',')

  useEffect(() => {
    if (messageIds.length === 0) return

    // Initial fetch of already-processed rows
    supabase
      .from('message_metadata')
      .select('message_id, og_title, og_description, og_image_url')
      .in('message_id', messageIds)
      .eq('status', 'done')
      .then(({ data }) => {
        if (!data) return
        setPreviews((prev) => {
          const next = new Map(prev)
          data.forEach((row) => {
            next.set(row.message_id, {
              og_title: row.og_title,
              og_description: row.og_description,
              og_image_url: row.og_image_url,
            })
          })
          return next
        })
      })

    // Subscribe to worker writes as they arrive
    const channel = supabase
      .channel(channelRef.current)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'message_metadata' },
        (payload) => {
          const row = payload.new as {
            message_id: string
            status: string
            og_title: string | null
            og_description: string | null
            og_image_url: string | null
          }
          if (!messageIds.includes(row.message_id) || row.status !== 'done') return
          setPreviews((prev) => {
            const next = new Map(prev)
            next.set(row.message_id, {
              og_title: row.og_title,
              og_description: row.og_description,
              og_image_url: row.og_image_url,
            })
            return next
          })
        }
      )
      .subscribe()

    return () => {
      channel.teardown()
      ;(supabase.realtime as unknown as { _remove: (ch: typeof channel) => void })._remove(channel)
    }
  }, [idsKey])

  return previews
}
