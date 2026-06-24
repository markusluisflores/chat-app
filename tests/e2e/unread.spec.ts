import { test, expect, type Page } from '@playwright/test'
import { USER_A, USER_B } from './global-setup'

async function loginAsUserA(page: Page) {
  await page.goto('/login')
  await page.fill('#email', USER_A.email)
  await page.fill('#password', USER_A.password)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/chat/)
}

/** Selects the message preview <p> inside the USER_B conversation link. */
function conversationPreview(page: Page) {
  return page.locator(`a[href="/chat/${USER_B.username}"] p`).first()
}

test.describe('Unread conversation bold indicator', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUserA(page)
  })

  test('conversation is bold when last message is unread', async ({ page }) => {
    await page.goto('/chat')
    await page.waitForLoadState('networkidle')

    await expect(conversationPreview(page)).toHaveClass(/font-semibold/)
  })

  test('conversation stays not-bold after opening conversation then refreshing (DB persistence)', async ({ page }) => {
    // Open the conversation — this fires mark_messages_read RPC which sets read_at in DB.
    await page.goto(`/chat/${USER_B.username}`)
    await page.waitForLoadState('networkidle')

    // Hard page refresh — ConversationList remounts and re-reads from DB.
    // Before the fix: RPC never fired so read_at was null → bold again.
    // After the fix: read_at is set → conversation loads as not-bold.
    await page.reload()
    await page.waitForLoadState('networkidle')

    await expect(conversationPreview(page)).not.toHaveClass(/font-semibold/)
  })

  test('conversation stays not-bold after opening then switching away (in-memory state)', async ({ page }) => {
    // Open the conversation (marks read in-memory via onOpen callback).
    await page.goto(`/chat/${USER_B.username}`)
    await page.waitForLoadState('networkidle')

    // SPA navigate to Settings — the (chat) layout stays mounted so
    // ConversationList state is preserved (no remount, no load() re-run).
    await page.click('a[href="/settings"]')
    await page.waitForURL('/settings')
    await page.waitForLoadState('networkidle')

    await expect(conversationPreview(page)).not.toHaveClass(/font-semibold/)
  })
})
