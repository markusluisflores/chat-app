import type { Message } from '@/types'
import type { OgMetadata } from '@/worker/processors/link-preview'
import { formatTime } from '@/lib/utils'
import { LinkPreviewCard } from '@/components/messages/LinkPreviewCard'

type Props = {
  message: Message
  isSent: boolean
  preview?: OgMetadata
}

export function MessageBubble({ message, isSent, preview }: Props) {
  return (
    <div className={`flex ${isSent ? 'justify-end' : 'justify-start'} mb-2`}>
      <div
        className={`max-w-xs lg:max-w-md px-4 py-2 rounded-2xl text-sm ${
          isSent
            ? 'bg-blue-500 text-white rounded-br-sm'
            : 'bg-gray-100 text-gray-900 rounded-bl-sm'
        }`}
      >
        <p>{message.content}</p>
        <span
          className={`text-xs mt-1 block ${
            isSent ? 'text-blue-100' : 'text-gray-400'
          }`}
        >
          {formatTime(message.created_at)}
        </span>
        {preview && <LinkPreviewCard meta={preview} />}
      </div>
    </div>
  )
}
