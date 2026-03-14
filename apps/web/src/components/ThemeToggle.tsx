'use client'

import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useEffect, useMemo, useState } from 'react'

const themes = [
  { value: 'light', icon: Sun, label: 'Light' },
  { value: 'dark', icon: Moon, label: 'Dark' },
  { value: 'system', icon: Monitor, label: 'System' },
] as const

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const nextTheme = useMemo(() => {
    const order = ['dark', 'light', 'system'] as const
    const idx = order.indexOf(theme as (typeof order)[number])
    return order[(idx + 1) % order.length]
  }, [theme])

  const cycle = () => {
    setTheme(nextTheme)
  }

  const current = themes.find((t) => t.value === theme) ?? themes[1]
  const Icon = current.icon
  const nextThemeLabel = nextTheme === 'system' ? 'System' : nextTheme === 'light' ? 'Light' : 'Dark'
  const activeLabel = theme === 'system' ? `System (${resolvedTheme === 'dark' ? 'Dark' : 'Light'})` : current.label

  if (!mounted) {
    return (
      <div className="h-11 w-11 rounded-xl border border-[var(--color-border)] bg-[var(--glass-bg)]" />
    )
  }

  return (
    <button
      onClick={cycle}
      data-testid="theme-toggle"
      aria-label={`Switch to ${nextThemeLabel} theme`}
      title={`Switch to ${nextThemeLabel}${theme === 'system' ? ` theme · active: ${activeLabel}` : ' theme'}`}
      className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--glass-bg)] transition-all duration-200 hover:border-[var(--color-border-hover)] hover:bg-[var(--color-bg-card-hover)]"
    >
      <Icon className="h-4 w-4 text-[var(--color-text-secondary)]" />
    </button>
  )
}
