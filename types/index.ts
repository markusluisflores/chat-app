export type Profile = {
  id: string
  display_name: string
  avatar_url: string | null
  updated_at: string
}

export type Message = {
  id: string
  sender_id: string
  receiver_id: string
  content: string
  created_at: string
  read_at: string | null
}

export type Session = {
  userId: string
  email: string
  displayName: string
  avatarUrl: string | null
}
