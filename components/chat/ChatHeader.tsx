import type { Profile } from '@/types'

type Props = {
  user: Pick<Profile, 'display_name' | 'avatar_url'>
  isOnline: boolean
}

export function ChatHeader({ user, isOnline }: Props) {
  return (
    <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
      <div className="relative">
        {user.avatar_url ? (
          <img
            src={user.avatar_url}
            alt={user.display_name}
            className="w-10 h-10 rounded-full object-cover"
          />
        ) : (
          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center font-medium text-gray-600">
            {(user.display_name[0] ?? '?').toUpperCase()}
          </div>
        )}
        <span
          className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white ${
            isOnline ? 'bg-green-400' : 'bg-gray-300'
          }`}
        />
      </div>
      <div>
        <p className="font-semibold text-gray-900">{user.display_name}</p>
        <p className="text-xs text-gray-400">{isOnline ? 'Online' : 'Offline'}</p>
      </div>
    </div>
  )
}
