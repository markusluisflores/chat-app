'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import type { Session } from '@/types'
import { createClient } from '@/lib/supabase/client'

type SessionContextValue = {
  session: Session | null
  isLoading: boolean
}

const SessionContext = createContext<SessionContextValue>({
  session: null,
  isLoading: true,
})

export function SessionProvider({
  children,
  initialSession,
}: {
  children: React.ReactNode
  initialSession: Session | null
}) {
  const [session, setSession] = useState<Session | null>(initialSession)
  const [isLoading, setIsLoading] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, supabaseSession) => {
      if (supabaseSession) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name, avatar_url')
          .eq('id', supabaseSession.user.id)
          .single()

        setSession({
          userId: supabaseSession.user.id,
          email: supabaseSession.user.email!,
          displayName: profile?.display_name ?? supabaseSession.user.email!,
          avatarUrl: profile?.avatar_url ?? null,
        })
      } else {
        setSession(null)
      }
      setIsLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  return (
    <SessionContext.Provider value={{ session, isLoading }}>
      {children}
    </SessionContext.Provider>
  )
}

export function useSessionContext() {
  return useContext(SessionContext)
}
