import { test, expect, type Page } from '@playwright/test'
import { USER_A, USER_B } from './global-setup'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !ANON_KEY) {
  throw new Error(
    'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set before running Playwright'
  )
}

async function loginAs(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.fill('#email', email)
  await page.fill('#password', password)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/chat/)
  await page.waitForLoadState('networkidle')
}

async function getAccessToken(email: string, password: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY!, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(`Failed to get access token: ${await res.text()}`)
  const data = await res.json()
  return data.access_token as string
}

async function getMessageMetadata(
  messageId: string,
  authHeaders: Record<string, string>,
  maxWaitSeconds: number = 15
) {
  for (let i = 0; i < maxWaitSeconds; i++) {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/message_metadata?message_id=eq.${messageId}&status=eq.done&select=status,og_title`,
      { headers: authHeaders }
    )

    if (response.ok) {
      const data = await response.json()
      if (data.length > 0) {
        return data[0]
      }
    }

    if (i < maxWaitSeconds - 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
  }

  return null
}

test.describe('Link preview pipeline', () => {
  test('link preview appears after sending a message with a URL', async ({ page }) => {
    // Login as USER_A
    await loginAs(page, USER_A.email, USER_A.password)

    // Get access token for authenticated Supabase REST API calls (RLS requires bearer token)
    const accessToken = await getAccessToken(USER_A.email, USER_A.password)
    const authHeaders = {
      apikey: ANON_KEY!,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    }

    // Navigate to chat with USER_B
    await page.goto(`/chat/${USER_B.username}`)
    await page.waitForLoadState('networkidle')

    // Send a message containing a URL with known OG tags
    const urlMessage = `Check this out https://github.com ${Date.now()}`
    await page.fill('input[placeholder="Write a message..."]', urlMessage)
    await page.press('input[placeholder="Write a message..."]', 'Enter')

    // Wait for the message to appear in the chat feed (scope to main to avoid
    // matching the sidebar conversation-list preview of the same text)
    await expect(page.locator('main').locator(`text=${urlMessage}`)).toBeVisible({ timeout: 5000 })

    // Find the message in Supabase
    const messagesResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/messages?content=ilike.%github.com%&order=created_at.desc&limit=1`,
      { headers: authHeaders }
    )

    expect(messagesResponse.ok).toBeTruthy()
    const messages = await messagesResponse.json()
    expect(messages.length).toBeGreaterThan(0)

    const messageId = messages[0].id
    expect(messageId).toBeTruthy()

    // Poll message_metadata until status = done (max 15s)
    const meta = await getMessageMetadata(messageId, authHeaders)

    expect(meta).not.toBeNull()
    expect(meta).toHaveProperty('status', 'done')

    // Assert preview card is visible in the UI
    await expect(page.locator('[data-testid="link-preview-card"]')).toBeVisible({ timeout: 5000 })
  })
})
