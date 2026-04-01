'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

type ShortcutHandler = () => void

interface ShortcutConfig {
  keys: string[]
  handler: ShortcutHandler
  description: string
  /** If true, skip when input/textarea/select is focused */
  skipOnInput?: boolean
}

/**
 * Global keyboard shortcut registry.
 * Supports single keys, modifier combos, and G-prefix sequences.
 */
export function useKeyboardShortcuts(shortcuts?: ShortcutConfig[]) {
  const router = useRouter()
  const gPressedRef = useRef(false)
  const gTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      const isInputFocused = ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) ||
        (e.target as HTMLElement).isContentEditable

      // G prefix navigation — skip if any modifier key or input focused
      if (!e.ctrlKey && !e.metaKey && !e.altKey && !isInputFocused) {
        if (e.key === 'g' || e.key === 'G') {
          e.preventDefault()
          gPressedRef.current = true
          if (gTimerRef.current) clearTimeout(gTimerRef.current)
          gTimerRef.current = setTimeout(() => {
            gPressedRef.current = false
          }, 1000)
          return
        }

        if (gPressedRef.current) {
          gPressedRef.current = false
          if (gTimerRef.current) clearTimeout(gTimerRef.current)

          switch (e.key.toLowerCase()) {
            case 'd':
              e.preventDefault()
              router.push('/')
              return
            case 'c':
              e.preventDefault()
              router.push('/clusters')
              return
            case 'l':
              e.preventDefault()
              router.push('/logs')
              return
            case 'a':
              e.preventDefault()
              router.push('/alerts')
              return
            case 'f':
              e.preventDefault()
              router.push('/feature-flags')
              return
            case 's':
              e.preventDefault()
              router.push('/services')
              return
            case 'e':
              e.preventDefault()
              router.push('/events')
              return
          }
        }
      }

      // Custom shortcuts passed in
      if (shortcuts) {
        for (const shortcut of shortcuts) {
          const [primary, ...modifiers] = shortcut.keys
          const skipOnInput = shortcut.skipOnInput !== false
          if (skipOnInput && isInputFocused) continue

          // Don't intercept browser shortcuts (Cmd/Ctrl+key) unless explicitly required
          if (!modifiers.includes('meta') && e.metaKey) continue
          if (!modifiers.includes('ctrl') && e.ctrlKey) continue

          const modMatch =
            (!modifiers.includes('meta') || e.metaKey) &&
            (!modifiers.includes('ctrl') || e.ctrlKey) &&
            (!modifiers.includes('shift') || e.shiftKey) &&
            (!modifiers.includes('alt') || e.altKey)

          if (modMatch && (e.key === primary || e.key.toLowerCase() === primary.toLowerCase())) {
            e.preventDefault()
            shortcut.handler()
          }
        }
      }
    },
    [router, shortcuts],
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (gTimerRef.current) clearTimeout(gTimerRef.current)
    }
  }, [handleKeyDown])
}

export const GLOBAL_SHORTCUTS = [
  { keys: ['⌘K', 'Ctrl+K'], description: 'Open command palette', group: 'Global' },
  { keys: ['?'], description: 'Show keyboard shortcuts', group: 'Global' },
  { keys: ['G', 'D'], description: 'Go to Dashboard', group: 'Navigation' },
  { keys: ['G', 'C'], description: 'Go to Clusters', group: 'Navigation' },
  { keys: ['G', 'L'], description: 'Go to Logs', group: 'Navigation' },
  { keys: ['G', 'A'], description: 'Go to Alerts', group: 'Navigation' },
  { keys: ['G', 'F'], description: 'Go to Feature Flags', group: 'Navigation' },
  { keys: ['G', 'S'], description: 'Go to Services', group: 'Navigation' },
  { keys: ['G', 'E'], description: 'Go to Events', group: 'Navigation' },
  { keys: ['/'], description: 'Focus search', group: 'Actions' },
  { keys: ['N'], description: 'New item (context-sensitive)', group: 'Actions' },
  { keys: ['R'], description: 'Refresh data', group: 'Actions' },
  { keys: ['J'], description: 'Move down in list', group: 'Lists' },
  { keys: ['K'], description: 'Move up in list', group: 'Lists' },
  { keys: ['Enter'], description: 'Open selected item', group: 'Lists' },
  { keys: ['Esc'], description: 'Close drawer / modal', group: 'Lists' },
]
