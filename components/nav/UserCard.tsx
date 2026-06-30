import Image from 'next/image'
import Link from 'next/link'
import type { Profile } from '@/types'

type Props = {
  profile: Pick<Profile, 'id' | 'display_name' | 'avatar_url' | 'username'>
  isOnline: boolean
}

export function UserCard({ profile, isOnline }: Props) {
  return (
    <Link href={`/chat/${profile.username}`}>
      <div className="flex items-center gap-2 px-4 py-2 hover:bg-gray-100 cursor-pointer rounded-lg mx-1">
        <div className="relative flex-shrink-0">
          {profile.avatar_url ? (
            <Image
              src={profile.avatar_url}
              alt={profile.display_name}
              width={28}
              height={28}
              className="w-7 h-7 rounded-full object-cover"
            />
          ) : (
            <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-xs font-medium text-gray-600">
              {(profile.display_name[0] ?? '?').toUpperCase()}
            </div>
          )}
          <span
            className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-gray-50 ${
              isOnline ? 'bg-green-400' : 'bg-gray-300'
            }`}
          />
        </div>
        <span className="text-sm text-gray-700 truncate">{profile.display_name}</span>
      </div>
    </Link>
  )
}
