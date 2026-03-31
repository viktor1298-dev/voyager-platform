'use client'

import { authClient } from '@/lib/auth-client'
import { useAuthStore } from '@/stores/auth'
import { dropdownVariants } from '@/lib/animation-constants'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { LogOut, Settings, User } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'

export function UserMenu() {
  const user = useAuthStore((s) => s.user)
  const [open, setOpen] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const reducedMotion = useReducedMotion()

  // Initials from name or email
  const initials = user
    ? (user.name ?? user.email)
        .split(/[\s@]+/)
        .slice(0, 2)
        .map((s) => s[0]?.toUpperCase() ?? '')
        .join('')
    : '?'

  // Close on click outside
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Close on Escape, return focus to button
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  const handleLogout = useCallback(async () => {
    if (isLoggingOut) return
    setIsLoggingOut(true)

    const loggedOutAt = Date.now()
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('logoutInProgress', String(loggedOutAt))
    }

    try {
      const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`
      const returnUrl =
        currentPath.startsWith('/') && !currentPath.startsWith('//') ? currentPath : '/'

      await authClient.signOut({ fetchOptions: { onSuccess: () => {} } })

      const loginUrl = new URL('/login', window.location.origin)
      loginUrl.searchParams.set('loggedOut', '1')
      loginUrl.searchParams.set('loggedOutAt', String(loggedOutAt))
      if (returnUrl !== '/') {
        loginUrl.searchParams.set('returnUrl', returnUrl)
      }
      window.location.replace(`${loginUrl.pathname}?${loginUrl.searchParams.toString()}`)
    } finally {
      useAuthStore.getState().clearUser()
    }
  }, [isLoggingOut])

  if (!user) return null

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen((v) => !v)}
        aria-label="User menu"
        aria-expanded={open}
        aria-haspopup="menu"
        title={user.name ?? user.email}
        className="flex h-[30px] w-[30px] items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[11px] font-semibold text-[var(--color-text-secondary)] transition-colors duration-150 hover:border-[var(--color-border-hover)] hover:bg-[var(--color-bg-card)] hover:text-[var(--color-text-primary)]"
      >
        {initials}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            aria-label="User menu"
            variants={reducedMotion ? undefined : dropdownVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="absolute right-0 top-full mt-2 z-50 w-[200px] rounded-xl border border-[var(--color-border-hover)] bg-[var(--color-bg-secondary)] shadow-lg overflow-hidden"
            style={{
              boxShadow: 'var(--color-bg-primary, #0a0a0f) 0 0 0 0, 0 8px 24px rgba(0,0,0,0.3)',
            }}
          >
            {/* Header */}
            <div className="px-3 pt-2.5 pb-2 border-b border-[var(--color-border)]">
              <div className="text-[13px] font-semibold text-[var(--color-text-primary)] truncate">
                {user.name ?? 'User'}
              </div>
              <div className="text-[11px] text-[var(--color-text-muted)] truncate">
                {user.email}
              </div>
            </div>

            {/* Menu items */}
            <div className="p-1.5">
              <button
                type="button"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-[var(--color-text-secondary)] transition-colors duration-150 hover:bg-[var(--color-bg-card-hover)] hover:text-[var(--color-text-primary)]"
              >
                <User className="h-[15px] w-[15px] opacity-60" />
                Profile
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-[var(--color-text-secondary)] transition-colors duration-150 hover:bg-[var(--color-bg-card-hover)] hover:text-[var(--color-text-primary)]"
              >
                <Settings className="h-[15px] w-[15px] opacity-60" />
                Settings
              </button>

              <div className="mx-2 my-1 h-px bg-[var(--color-border)]" />

              <button
                type="button"
                role="menuitem"
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-[var(--color-status-error)] transition-colors duration-150 hover:bg-[var(--color-status-error)]/10 disabled:opacity-60"
              >
                <LogOut className="h-[15px] w-[15px] opacity-60" />
                {isLoggingOut ? 'Logging out…' : 'Log out'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
