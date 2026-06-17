import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { UserCard } from '@/components/nav/UserCard'
import type { Profile } from '@/types'

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) =>
    React.createElement('a', { href }, children),
}))

const profile: Pick<Profile, 'id' | 'display_name' | 'avatar_url' | 'username'> = {
  id: 'user-a',
  display_name: 'Alice',
  avatar_url: null,
  username: 'alice',
}

describe('UserCard', () => {
  it('renders the display name', () => {
    render(<UserCard profile={profile} isOnline={false} />)
    expect(screen.getByText('Alice')).toBeInTheDocument()
  })

  it('links to /chat/<username>', () => {
    render(<UserCard profile={profile} isOnline={false} />)
    expect(screen.getByRole('link')).toHaveAttribute('href', '/chat/alice')
  })

  it('shows green dot when online', () => {
    const { container } = render(<UserCard profile={profile} isOnline={true} />)
    expect(container.querySelector('.bg-green-400')).toBeInTheDocument()
  })

  it('shows gray dot when offline', () => {
    const { container } = render(<UserCard profile={profile} isOnline={false} />)
    expect(container.querySelector('.bg-gray-300')).toBeInTheDocument()
  })
})
