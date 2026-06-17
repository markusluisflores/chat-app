'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { validateUsername } from '@/lib/utils'

type Props = {
  currentUserId: string
  currentUsername: string
}

export function UsernameForm({ currentUserId, currentUsername }: Props) {
  const [username, setUsername] = useState(currentUsername)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    const validationError = validateUsername(username)
    if (validationError) {
      setError(validationError)
      return
    }

    setLoading(true)
    let dbError: { code?: string; message?: string } | null = null
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ username })
        .eq('id', currentUserId)
      dbError = error
    } finally {
      setLoading(false)
    }

    if (dbError) {
      setError(
        dbError.code === '23505'
          ? 'Username is already taken'
          : 'Something went wrong. Please try again.',
      )
      return
    }

    setSuccess(true)
  }

  return (
    <div className="max-w-md p-6">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Settings</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="username"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Username
          </label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value)
              setSuccess(false)
            }}
            disabled={loading}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
          />
          <p className="mt-1 text-xs text-gray-400">
            3–30 characters · lowercase letters, numbers, - and _ only
          </p>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && <p className="text-sm text-green-600">Username updated</p>}
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 disabled:opacity-50"
        >
          {loading ? 'Saving…' : 'Save'}
        </button>
      </form>
    </div>
  )
}
