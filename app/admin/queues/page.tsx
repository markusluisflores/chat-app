import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getLinkPreviewQueue } from '@/lib/queue'

export default async function QueuesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('is_admin').eq('id', user.id).single()
  if (!profile?.is_admin) redirect('/chat')

  const queue = getLinkPreviewQueue()
  const [counts, failedJobs] = await Promise.all([
    queue.getJobCounts('waiting', 'active', 'completed', 'failed'),
    queue.getFailed(0, 9),
  ])

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Queue: link-preview</h1>

      <div className="grid grid-cols-4 gap-4 mb-10">
        {Object.entries(counts).map(([state, count]) => (
          <div key={state} className="rounded-lg border border-gray-200 p-4 text-center">
            <p className="text-3xl font-bold">{count}</p>
            <p className="text-sm text-gray-500 mt-1 capitalize">{state}</p>
          </div>
        ))}
      </div>

      <h2 className="text-lg font-semibold mb-4">Failed jobs (last 10)</h2>
      {failedJobs.length === 0 ? (
        <p className="text-gray-500 text-sm">No failed jobs.</p>
      ) : (
        <ul className="space-y-3">
          {failedJobs.map((job) => (
            <li key={job.id} className="rounded-lg border border-red-100 bg-red-50 p-4 text-sm">
              <p className="font-medium text-red-700">Job {job.id}</p>
              <p className="text-gray-600 mt-1">URL: {job.data.url}</p>
              <p className="text-gray-500 mt-1">Error: {job.failedReason}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
