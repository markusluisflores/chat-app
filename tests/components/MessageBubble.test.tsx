import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { MessageBubble } from '@/components/chat/MessageBubble'
import type { Message } from '@/types'

const message: Message = {
  id: 'msg-1',
  sender_id: 'user-a',
  receiver_id: 'user-b',
  content: 'Hello!',
  created_at: '2026-06-04T10:00:00.000Z',
  read_at: null,
}

describe('MessageBubble', () => {
  it('renders message content', () => {
    render(<MessageBubble message={message} isSent={true} />)
    expect(screen.getByText('Hello!')).toBeInTheDocument()
  })

  it('aligns right when isSent is true', () => {
    const { container } = render(<MessageBubble message={message} isSent={true} />)
    expect(container.firstChild).toHaveClass('justify-end')
  })

  it('aligns left when isSent is false', () => {
    const { container } = render(<MessageBubble message={message} isSent={false} />)
    expect(container.firstChild).toHaveClass('justify-start')
  })

  it('applies blue background for sent messages', () => {
    render(<MessageBubble message={message} isSent={true} />)
    expect(screen.getByText('Hello!').closest('div')).toHaveClass('bg-blue-500')
  })

  it('applies gray background for received messages', () => {
    render(<MessageBubble message={message} isSent={false} />)
    expect(screen.getByText('Hello!').closest('div')).toHaveClass('bg-gray-100')
  })
})
