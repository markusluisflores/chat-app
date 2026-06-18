import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ConversationItem } from '@/components/conversations/ConversationItem'
import type { Profile, Message } from '@/types'

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) =>
    React.createElement('a', { href }, children),
}))

const profile: Pick<Profile, 'id' | 'display_name' | 'avatar_url' | 'username'> = {
  id: 'user-b',
  display_name: 'Alice',
  avatar_url: null,
  username: 'alice',
}

const unreadMessage: Message = {
  id: 'msg-1',
  sender_id: 'user-a',
  receiver_id: 'user-b',
  content: 'Hey there',
  created_at: '2026-06-04T10:00:00.000Z',
  read_at: null,
}

const readMessage: Message = {
  ...unreadMessage,
  read_at: '2026-06-04T10:01:00.000Z',
}

describe('ConversationItem', () => {
  it('renders the user display name', () => {
    render(
      <ConversationItem user={profile} lastMessage={null} isOnline={false} isActive={false} currentUserId="user-a" />
    )
    expect(screen.getByText('Alice')).toBeInTheDocument()
  })

  it('links to /chat/<username>', () => {
    render(
      <ConversationItem user={profile} lastMessage={null} isOnline={false} isActive={false} currentUserId="user-a" />
    )
    expect(screen.getByRole('link')).toHaveAttribute('href', '/chat/alice')
  })

  it('shows message content when lastMessage is provided', () => {
    render(
      <ConversationItem user={profile} lastMessage={unreadMessage} isOnline={false} isActive={false} currentUserId="user-a" />
    )
    expect(screen.getByText('Hey there')).toBeInTheDocument()
  })

  it('applies font-semibold when read_at is null and conversation is not active (unread)', () => {
    render(
      <ConversationItem user={profile} lastMessage={unreadMessage} isOnline={false} isActive={false} currentUserId="user-b" />
    )
    expect(screen.getByText('Hey there')).toHaveClass('font-semibold')
  })

  it('does not apply font-semibold when read_at is set (read)', () => {
    render(
      <ConversationItem user={profile} lastMessage={readMessage} isOnline={false} isActive={false} currentUserId="user-b" />
    )
    expect(screen.getByText('Hey there')).not.toHaveClass('font-semibold')
  })

  it('does not apply font-semibold when conversation is active, even if read_at is null', () => {
    render(
      <ConversationItem user={profile} lastMessage={unreadMessage} isOnline={false} isActive={true} currentUserId="user-b" />
    )
    expect(screen.getByText('Hey there')).not.toHaveClass('font-semibold')
  })

  it('shows green online indicator when isOnline is true', () => {
    const { container } = render(
      <ConversationItem user={profile} lastMessage={null} isOnline={true} isActive={false} currentUserId="user-a" />
    )
    expect(container.querySelector('.bg-green-400')).toBeInTheDocument()
  })

  it('shows gray offline indicator when isOnline is false', () => {
    const { container } = render(
      <ConversationItem user={profile} lastMessage={null} isOnline={false} isActive={false} currentUserId="user-a" />
    )
    expect(container.querySelector('.bg-gray-300')).toBeInTheDocument()
  })
})
