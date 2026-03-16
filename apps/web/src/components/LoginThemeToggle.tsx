'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

/**
 * Compact theme toggle for the login page.
 * Cycles between light ↔ dark only (no system option for simplicity).
 */
export function LoginThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  if (!mounted) {
    return (
      <div className="h-9 w-9 rounded-lg border border-[var(--color-border)] bg-[var(--glass-bg)]" />
    )
  }

  const isDark = resolvedTheme === 'dark'

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      data-testid="login-theme-toggle"
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} theme`}
      title={`Switch to ${isDark ? 'light' : 'dark'} theme`}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--glass-bg)] text-[var(--color-text-secondary)] transition-all duration-200 hover:border-[var(--color-border-hover)] hover:bg-[var(--color-bg-card-hover)] hover:text-[var(--color-text-primary)]"
    >
      {isDark ? (
        <Sun className="h-4 w-4" />
      ) : (
        <Moon className="h-4 w-4" />
      )}
    </button>
  )
}
