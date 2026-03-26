'use client'

import { Monitor, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

const themes = [
  { value: 'light', icon: Sun, label: 'Light' },
  { value: 'dark', icon: Moon, label: 'Dark' },
  { value: 'system', icon: Monitor, label: 'System' },
] as const

/**
 * DA2-004: Theme toggle — dropdown with all 3 options visible at once.
 * Replaces the confusing 3-click cycle.
 */
export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => setMounted(true), [])

  // Close dropdown when clicking outside
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

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  const current = themes.find((t) => t.value === theme) ?? themes[1]
  const Icon = current.icon

  if (!mounted) {
    return (
      <div className="h-11 w-11 rounded-xl border border-[var(--color-border)] bg-[var(--glass-bg)]" />
    )
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        data-testid="theme-toggle"
        aria-label="Change theme"
        aria-expanded={open}
        aria-haspopup="listbox"
        title={`Theme: ${current.label}${theme === 'system' ? ` (${resolvedTheme === 'dark' ? 'Dark' : 'Light'})` : ''}`}
        className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--glass-bg)] transition-all duration-200 hover:border-[var(--color-border-hover)] hover:bg-[var(--color-bg-card-hover)]"
      >
        <Icon className="h-4 w-4 text-[var(--color-text-secondary)]" />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Theme options"
          className="absolute right-0 top-full mt-2 z-50 min-w-[160px] rounded-xl border border-[var(--color-border)] bg-[var(--glass-bg)] backdrop-blur-xl shadow-lg overflow-hidden animate-fade-in"
        >
          {themes.map((t) => {
            const ThemeIcon = t.icon
            const isActive = theme === t.value
            return (
              <button
                key={t.value}
                role="option"
                aria-selected={isActive}
                onClick={() => {
                  setTheme(t.value)
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center gap-3 px-3 py-2.5 text-sm transition-colors',
                  isActive
                    ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-card-hover)] hover:text-[var(--color-text-primary)]',
                )}
              >
                <ThemeIcon className="h-4 w-4" />
                <span className="font-medium">{t.label}</span>
                {isActive && (
                  <span className="ml-auto text-xs text-[var(--color-accent)]">✓</span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
