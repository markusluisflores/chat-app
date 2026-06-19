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
      <ConversationItem user={profile} lastMessage={null} isOnline={false} isActive={false} isRead={false} currentUserId="user-a" onOpen={() => {}} />
    )
    expect(screen.getByText('Alice')).toBeInTheDocument()
  })

  it('links to /chat/<username>', () => {
    render(
      <ConversationItem user={profile} lastMessage={null} isOnline={false} isActive={false} isRead={false} currentUserId="user-a" onOpen={() => {}} />
    )
    expect(screen.getByRole('link')).toHaveAttribute('href', '/chat/alice')
  })

  it('shows message content when lastMessage is provided', () => {
    render(
      <ConversationItem user={profile} lastMessage={unreadMessage} isOnline={false} isActive={false} isRead={false} currentUserId="user-a" onOpen={() => {}} />
    )
    expect(screen.getByText('Hey there')).toBeInTheDocument()
  })

  it('applies font-semibold when read_at is null and conversation is not active (unread)', () => {
    render(
      <ConversationItem user={profile} lastMessage={unreadMessage} isOnline={false} isActive={false} isRead={false} currentUserId="user-b" onOpen={() => {}} />
    )
    expect(screen.getByText('Hey there')).toHaveClass('font-semibold')
  })

  it('does not apply font-semibold when read_at is set (read)', () => {
    render(
      <ConversationItem user={profile} lastMessage={readMessage} isOnline={false} isActive={false} isRead={false} currentUserId="user-b" onOpen={() => {}} />
    )
    expect(screen.getByText('Hey there')).not.toHaveClass('font-semibold')
  })

  it('does not apply font-semibold when conversation is active, even if read_at is null', () => {
    render(
      <ConversationItem user={profile} lastMessage={unreadMessage} isOnline={false} isActive={true} isRead={false} currentUserId="user-b" onOpen={() => {}} />
    )
    expect(screen.getByText('Hey there')).not.toHaveClass('font-semibold')
  })

  it('does not apply font-semibold when isRead is true, even if read_at is null and not active', () => {
    render(
      <ConversationItem user={profile} lastMessage={unreadMessage} isOnline={false} isActive={false} isRead={true} currentUserId="user-b" onOpen={() => {}} />
    )
    expect(screen.getByText('Hey there')).not.toHaveClass('font-semibold')
  })

  it('applies font-semibold again when a newer message arrives after the conversation was read', () => {
    // Simulates: user read the conversation when lastMessage was msg-1,
    // then a new message (msg-2, later timestamp) arrives — isRead becomes false again.
    const newerMessage: Message = {
      ...unreadMessage,
      id: 'msg-2',
      created_at: '2026-06-04T11:00:00.000Z', // later than the timestamp that was "read"
    }
    // isRead=false because the new message's created_at is after the stored readTimestamp
    render(
      <ConversationItem user={profile} lastMessage={newerMessage} isOnline={false} isActive={false} isRead={false} currentUserId="user-b" onOpen={() => {}} />
    )
    expect(screen.getByText('Hey there')).toHaveClass('font-semibold')
  })

  it('shows green online indicator when isOnline is true', () => {
    const { container } = render(
      <ConversationItem user={profile} lastMessage={null} isOnline={true} isActive={false} isRead={false} currentUserId="user-a" onOpen={() => {}} />
    )
    expect(container.querySelector('.bg-green-400')).toBeInTheDocument()
  })

  it('shows gray offline indicator when isOnline is false', () => {
    const { container } = render(
      <ConversationItem user={profile} lastMessage={null} isOnline={false} isActive={false} isRead={false} currentUserId="user-a" onOpen={() => {}} />
    )
    expect(container.querySelector('.bg-gray-300')).toBeInTheDocument()
  })
})
