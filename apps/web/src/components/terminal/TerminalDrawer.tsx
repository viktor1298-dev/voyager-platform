'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronDown, Minus, Terminal as TerminalIcon } from 'lucide-react'
import { DURATION, EASING } from '@/lib/animation-constants'
import { useTerminal } from './terminal-context'
import { TerminalTab } from './TerminalTab'
import { TerminalSession } from './TerminalSession'

const MIN_HEIGHT = 200
const MAX_HEIGHT_RATIO = 0.8
const DEFAULT_HEIGHT_RATIO = 0.4
const COLLAPSED_HEIGHT = 32
const DRAG_HANDLE_HEIGHT = 6

const drawerVariants = {
  hidden: { y: '100%', opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: { type: 'spring' as const, stiffness: 350, damping: 24 },
  },
  exit: {
    y: '100%',
    opacity: 0,
    transition: { duration: DURATION.fast, ease: EASING.exit },
  },
} as const

export function TerminalDrawer() {
  const { sessions, activeSessionId, setActiveSession, closeSession, isDrawerOpen, setDrawerOpen } =
    useTerminal()

  const [collapsed, setCollapsed] = useState(false)
  const [height, setHeight] = useState(0)
  const isDragging = useRef(false)
  const startY = useRef(0)
  const startHeight = useRef(0)

  // Initialize height on first render (needs window)
  useEffect(() => {
    if (height === 0) {
      setHeight(Math.round(window.innerHeight * DEFAULT_HEIGHT_RATIO))
    }
  }, [height])

  // Keyboard shortcut: Ctrl+backtick toggles drawer
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === '`') {
        e.preventDefault()
        if (sessions.length > 0) {
          setDrawerOpen(!isDrawerOpen)
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [sessions.length, isDrawerOpen, setDrawerOpen])

  // Drag to resize
  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      isDragging.current = true
      startY.current = e.clientY
      startHeight.current = height

      const handleDragMove = (moveEvent: MouseEvent) => {
        if (!isDragging.current) return
        const delta = startY.current - moveEvent.clientY
        const maxH = Math.round(window.innerHeight * MAX_HEIGHT_RATIO)
        const newHeight = Math.max(MIN_HEIGHT, Math.min(maxH, startHeight.current + delta))
        setHeight(newHeight)
      }

      const handleDragEnd = () => {
        isDragging.current = false
        document.removeEventListener('mousemove', handleDragMove)
        document.removeEventListener('mouseup', handleDragEnd)
      }

      document.addEventListener('mousemove', handleDragMove)
      document.addEventListener('mouseup', handleDragEnd)
    },
    [height],
  )

  if (sessions.length === 0) return null

  return (
    <AnimatePresence>
      {isDrawerOpen && (
        <motion.div
          key="terminal-drawer"
          variants={drawerVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="fixed bottom-0 left-0 right-0 z-[100] flex flex-col border-t border-[var(--color-border)] bg-[var(--color-bg-primary)]"
          style={{ height: collapsed ? COLLAPSED_HEIGHT : height }}
        >
          {/* Drag handle */}
          <div
            onMouseDown={handleDragStart}
            className="flex items-center justify-center cursor-ns-resize shrink-0 group"
            style={{ height: DRAG_HANDLE_HEIGHT }}
          >
            <div className="w-8 h-1 rounded-full bg-[var(--color-border)] group-hover:bg-[var(--color-text-secondary)] transition-colors duration-150" />
          </div>

          {/* Tab bar + controls */}
          <div className="flex items-center justify-between px-2 h-7 shrink-0 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
              <TerminalIcon className="w-3.5 h-3.5 text-[var(--color-text-secondary)] shrink-0 mr-1" />
              {sessions.map((session) => (
                <TerminalTab
                  key={session.id}
                  session={session}
                  isActive={session.id === activeSessionId}
                  onActivate={() => setActiveSession(session.id)}
                  onClose={() => closeSession(session.id)}
                />
              ))}
            </div>
            <div className="flex items-center gap-1 shrink-0 ml-2">
              <button
                type="button"
                onClick={() => setCollapsed(!collapsed)}
                className="p-1 rounded hover:bg-[var(--color-border)] transition-colors duration-150 active:scale-95"
                title={collapsed ? 'Expand terminal' : 'Collapse terminal'}
              >
                {collapsed ? (
                  <ChevronDown className="w-3.5 h-3.5 rotate-180" />
                ) : (
                  <Minus className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          {/* Terminal sessions container */}
          {!collapsed && (
            <div className="flex-1 min-h-0 relative">
              {sessions.map((session) => (
                <TerminalSession
                  key={session.id}
                  clusterId={session.clusterId}
                  namespace={session.namespace}
                  podName={session.podName}
                  container={session.container}
                  isActive={session.id === activeSessionId}
                />
              ))}
            </div>
          )}

          {/* Collapsed bar */}
          {collapsed && (
            <div
              role="button"
              tabIndex={0}
              onClick={() => setCollapsed(false)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setCollapsed(false)
              }}
              className="flex-1 flex items-center px-3 text-xs text-[var(--color-text-secondary)] cursor-pointer hover:text-[var(--color-text-primary)] transition-colors duration-150"
            >
              {sessions.length} terminal session{sessions.length !== 1 ? 's' : ''}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
