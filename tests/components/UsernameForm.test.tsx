import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { UsernameForm } from '@/components/settings/UsernameForm'

const mockEq = vi.fn()

vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      update: vi.fn(() => ({
        eq: mockEq,
      })),
    })),
  })),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mockEq.mockResolvedValue({ error: null })
})

describe('UsernameForm', () => {
  it('pre-fills the input with the current username', () => {
    render(<UsernameForm currentUserId="user-1" currentUsername="alice" />)
    expect(screen.getByRole('textbox')).toHaveValue('alice')
  })

  it('shows a validation error when username is too short', async () => {
    const user = userEvent.setup()
    render(<UsernameForm currentUserId="user-1" currentUsername="alice" />)
    await user.clear(screen.getByRole('textbox'))
    await user.type(screen.getByRole('textbox'), 'ab')
    await user.click(screen.getByRole('button', { name: /save/i }))
    expect(screen.getByText(/3.30 characters/i)).toBeInTheDocument()
  })

  it('shows a validation error for a reserved username', async () => {
    const user = userEvent.setup()
    render(<UsernameForm currentUserId="user-1" currentUsername="alice" />)
    await user.clear(screen.getByRole('textbox'))
    await user.type(screen.getByRole('textbox'), 'login')
    await user.click(screen.getByRole('button', { name: /save/i }))
    expect(screen.getByText(/reserved/i)).toBeInTheDocument()
  })

  it('shows success message after a successful save', async () => {
    const user = userEvent.setup()
    render(<UsernameForm currentUserId="user-1" currentUsername="alice" />)
    await user.clear(screen.getByRole('textbox'))
    await user.type(screen.getByRole('textbox'), 'alice-new')
    await user.click(screen.getByRole('button', { name: /save/i }))
    expect(await screen.findByText(/username updated/i)).toBeInTheDocument()
  })

  it('shows "already taken" error on Postgres unique violation', async () => {
    mockEq.mockResolvedValue({ error: { code: '23505', message: 'unique violation' } })
    const user = userEvent.setup()
    render(<UsernameForm currentUserId="user-1" currentUsername="alice" />)
    await user.clear(screen.getByRole('textbox'))
    await user.type(screen.getByRole('textbox'), 'bob')
    await user.click(screen.getByRole('button', { name: /save/i }))
    expect(await screen.findByText(/already taken/i)).toBeInTheDocument()
  })
})
