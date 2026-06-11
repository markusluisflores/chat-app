import type { Metadata } from 'next'
import { Geist } from 'next/font/google'
import './globals.css'
import { SessionProvider } from '@/context/SessionContext'
import { createClient } from '@/lib/supabase/server'
import type { Session } from '@/types'

const geist = Geist({ subsets: ['latin'] })

export const metadata: Metadata = { title: 'ChatApp' }

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let initialSession: Session | null = null
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name, avatar_url')
      .eq('id', user.id)
      .single()

    initialSession = {
      userId: user.id,
      email: user.email!,
      displayName: profile?.display_name ?? user.email!,
      avatarUrl: profile?.avatar_url ?? null,
    }
  }

  return (
    <html lang="en">
      <body className={geist.className}>
        <SessionProvider initialSession={initialSession}>
          {children}
        </SessionProvider>
      </body>
    </html>
  )
}
