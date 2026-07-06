import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LinkPreviewCard } from '@/components/messages/LinkPreviewCard'

const fullMeta = {
  og_title: 'GitHub',
  og_description: 'Where code lives',
  og_image_url: 'https://github.com/og.png',
}

describe('LinkPreviewCard', () => {
  it('renders title and description when both are present', () => {
    render(<LinkPreviewCard meta={fullMeta} />)
    expect(screen.getByText('GitHub')).toBeDefined()
    expect(screen.getByText('Where code lives')).toBeDefined()
  })

  it('renders image when og_image_url is present', () => {
    const { container } = render(<LinkPreviewCard meta={fullMeta} />)
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    expect(img!.getAttribute('src')).toBe('https://github.com/og.png')
  })

  it('returns null when all fields are null', () => {
    const { container } = render(
      <LinkPreviewCard meta={{ og_title: null, og_description: null, og_image_url: null }} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders without image when og_image_url is null', () => {
    render(<LinkPreviewCard meta={{ ...fullMeta, og_image_url: null }} />)
    expect(screen.queryByRole('img')).toBeNull()
    expect(screen.getByText('GitHub')).toBeDefined()
  })
})
