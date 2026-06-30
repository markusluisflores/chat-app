import Image from 'next/image'
import Link from 'next/link'
import type { Profile, Message } from '@/types'
import { formatTime } from '@/lib/utils'

type Props = {
  user: Pick<Profile, 'id' | 'display_name' | 'avatar_url' | 'username'>
  lastMessage: Message | null
  isOnline: boolean
  isActive: boolean
  isRead: boolean
  onOpen: () => void
}

export function ConversationItem({ user, lastMessage, isOnline, isActive, isRead, onOpen }: Props) {
  return (
    <Link href={`/chat/${user.username}`} onClick={onOpen}>
      <div
        className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 ${
          isActive ? 'bg-blue-50' : ''
        }`}
      >
        <div className="relative flex-shrink-0">
          {user.avatar_url ? (
            <Image
              src={user.avatar_url}
              alt={user.display_name}
              width={40}
              height={40}
              className="w-10 h-10 rounded-full object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium text-gray-600">
              {(user.display_name[0] ?? '?').toUpperCase()}
            </div>
          )}
          <span
            className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${
              isOnline ? 'bg-green-400' : 'bg-gray-300'
            }`}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-baseline">
            <span className="font-medium text-sm text-gray-900 truncate">
              {user.display_name}
            </span>
            {lastMessage && (
              <span className="text-xs text-gray-400 flex-shrink-0 ml-2">
                {formatTime(lastMessage.created_at)}
              </span>
            )}
          </div>
          {lastMessage && (
            <p
              className={`text-xs truncate ${
                !isActive && !isRead
                  ? 'font-semibold text-gray-900'
                  : 'text-gray-500'
              }`}
            >
              {lastMessage.content}
            </p>
          )}
        </div>
      </div>
    </Link>
  )
}
