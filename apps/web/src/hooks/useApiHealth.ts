import { useEffect, useState } from 'react'

type ApiHealthStatus = 'checking' | 'connected' | 'unreachable'

export function useApiHealth(intervalMs = 5000): ApiHealthStatus {
  const [status, setStatus] = useState<ApiHealthStatus>('checking')

  useEffect(() => {
    let cancelled = false

    async function check() {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/health`, {
          signal: AbortSignal.timeout(3000),
        })
        if (!cancelled) setStatus(res.ok ? 'connected' : 'unreachable')
      } catch {
        if (!cancelled) setStatus('unreachable')
      }
    }

    check()
    const id = setInterval(check, intervalMs)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [intervalMs])

  return status
}
