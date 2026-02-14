'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'

const PUBLIC_PATHS = ['/login']

function isTokenValid(): boolean {
  if (typeof window === 'undefined') return false
  const token = localStorage.getItem('voyager-token')
  if (!token) return false
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload.exp * 1000 > Date.now()
  } catch {
    return false
  }
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (PUBLIC_PATHS.includes(pathname)) {
      setChecked(true)
      return
    }
    if (!isTokenValid()) {
      router.replace('/login')
    } else {
      setChecked(true)
    }
  }, [router, pathname])

  if (!checked) return null
  return <>{children}</>
}
