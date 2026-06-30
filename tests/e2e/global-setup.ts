// Uses raw fetch against the Supabase REST/Auth APIs so we don't pull in the
// realtime client (which requires native WebSocket — absent in Node.js < 22).

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !ANON_KEY) {
  throw new Error(
    'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set before running Playwright'
  )
}

export const USER_A = {
  email: 'playwright-test-a@mailinator.com',
  password: 'PlaywrightTest123!',
  username: 'playwright-test-a',
}

export const USER_B = {
  email: 'playwright-test-b@mailinator.com',
  password: 'PlaywrightTest123!',
  username: 'playwright-test-b',
}

const authHeaders = {
  apikey: ANON_KEY,
  'Content-Type': 'application/json',
}

async function signInOrSignUp(credentials: { email: string; password: string }) {
  const signInRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ email: credentials.email, password: credentials.password }),
  })

  if (signInRes.ok) {
    const data = await signInRes.json()
    return { accessToken: data.access_token as string, userId: data.user.id as string }
  }

  const signUpRes = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ email: credentials.email, password: credentials.password }),
  })
  if (!signUpRes.ok) {
    const err = await signUpRes.text()
    throw new Error(`Failed to create test user ${credentials.email}: ${err}`)
  }
  const data = await signUpRes.json()
  return { accessToken: data.access_token as string, userId: data.user.id as string }
}

export default async function globalSetup() {
  const [sessionB, sessionA] = await Promise.all([
    signInOrSignUp(USER_B),
    signInOrSignUp(USER_A),
  ])

  // Insert a fresh unread message from B → A so the conversation is always
  // bold at the start of each test run (new message always has read_at = null).
  const res = await fetch(`${SUPABASE_URL}/rest/v1/messages`, {
    method: 'POST',
    headers: {
      ...authHeaders,
      Authorization: `Bearer ${sessionB.accessToken}`,
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      sender_id: sessionB.userId,
      receiver_id: sessionA.userId,
      content: `E2E seed message ${Date.now()}`,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Failed to seed test message: ${err}`)
  }
}
