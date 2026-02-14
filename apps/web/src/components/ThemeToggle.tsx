'use client'

import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

export function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')

  useEffect(() => {
    const stored = localStorage.getItem('voyager-theme') as 'dark' | 'light' | null
    const initial = stored ?? 'dark'
    setTheme(initial)
    const html = document.documentElement
    const classes = html.className.split(/\s+/).filter(c => c && c !== 'dark' && c !== 'light')
    classes.push(initial)
    html.className = classes.join(' ')
  }, [])

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('voyager-theme', next)
    const html = document.documentElement
    const classes = html.className.split(/\s+/).filter(c => c && c !== 'dark' && c !== 'light')
    classes.push(next)
    html.className = classes.join(' ')
  }

  return (
    <button
      onClick={toggle}
      data-testid="theme-toggle"
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      className="h-8 w-8 rounded-lg border border-[var(--color-border)] hover:border-[var(--color-border-hover)] bg-[var(--glass-bg)] hover:bg-[var(--color-bg-card-hover)] flex items-center justify-center transition-all duration-200"
    >
      {theme === 'dark' ? (
        <Sun className="h-4 w-4 text-[var(--color-text-secondary)]" />
      ) : (
        <Moon className="h-4 w-4 text-[var(--color-text-secondary)]" />
      )}
    </button>
  )
}
