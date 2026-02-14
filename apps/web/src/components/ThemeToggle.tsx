'use client'

import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

const themes = [
  { value: 'light', icon: Sun, label: 'Light' },
  { value: 'dark', icon: Moon, label: 'Dark' },
  { value: 'system', icon: Monitor, label: 'System' },
] as const

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  const cycle = () => {
    const order = ['dark', 'light', 'system'] as const
    const idx = order.indexOf(theme as (typeof order)[number])
    setTheme(order[(idx + 1) % order.length])
  }

  const current = themes.find((t) => t.value === theme) ?? themes[1]
  const Icon = current.icon

  if (!mounted) {
    return (
      <div className="h-8 w-8 rounded-lg border border-[var(--color-border)] bg-[var(--glass-bg)]" />
    )
  }

  return (
    <button
      onClick={cycle}
      data-testid="theme-toggle"
      aria-label={`Current theme: ${current.label}. Click to switch.`}
      title={`Theme: ${current.label}`}
      className="h-8 w-8 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-border-hover)] bg-[var(--glass-bg)] hover:bg-[var(--color-bg-card-hover)] flex items-center justify-center transition-all duration-200"
    >
      <Icon className="h-4 w-4 text-[var(--color-text-secondary)]" />
    </button>
  )
}
