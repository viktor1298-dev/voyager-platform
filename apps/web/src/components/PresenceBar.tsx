'use client'

import { AnimatePresence, motion } from 'motion/react'
import { usePresence } from '@/hooks/usePresence'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { useAuthStore } from '@/stores/auth'

function initialsFromName(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export function PresenceBar() {
  const reduced = useReducedMotion()
  const { onlineUsers } = usePresence()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  // Ensure count is at least 1 when the current user is authenticated
  // (presence backend may not have processed the heartbeat yet on first load)
  const count = Math.max(onlineUsers.length, isAuthenticated ? 1 : 0)

  return (
    <div className="h-10 border-b border-[var(--color-border)] bg-[var(--color-bg-primary)]/85 backdrop-blur-lg flex items-center justify-between px-3 sm:px-6">
      {/* Left: ONLINE indicator */}
      <div className="flex items-center gap-2 min-w-0">
        {/* Pulsing green dot */}
        <span
          className="h-2 w-2 rounded-full shrink-0 animate-pulse-slow"
          style={{ backgroundColor: count > 0 ? 'var(--color-status-active, #22c55e)' : 'var(--color-text-dim)' }}
          aria-hidden="true"
        />
        <span className="text-[10px] font-mono tracking-wider text-[var(--color-text-dim)] uppercase select-none">
          Online
        </span>
        {/* Count badge */}
        <span
          className="inline-flex items-center justify-center h-4 min-w-[1rem] px-1 rounded-full text-[9px] font-bold font-mono leading-none"
          style={{
            backgroundColor: count > 0 ? 'var(--color-status-active, #22c55e)' : 'rgba(255,255,255,0.06)',
            color: count > 0 ? '#fff' : 'var(--color-text-dim)',
          }}
          title={`${count} user${count !== 1 ? 's' : ''} online`}
        >
          {count}
        </span>
      </div>

      {/* Right: User avatars — clearly identified, properly spaced from ONLINE indicator */}
      {onlineUsers.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto shrink-0">
          <AnimatePresence initial={false}>
            {onlineUsers.map((user) => {
              const dotColor = user.status === 'online'
                ? 'var(--color-status-active, #22c55e)'
                : 'var(--color-text-dim)'

              const tooltipText = `${user.name}${user.currentPage && user.currentPage !== '/' ? ` · ${user.currentPage}` : ''}`

              const avatar = (
                <div
                  className="group relative h-8 w-8 rounded-full border-2 border-[var(--color-border)] bg-[var(--color-accent)]/20 text-[var(--color-accent)] text-[11px] font-bold flex items-center justify-center shrink-0 cursor-default hover:border-[var(--color-accent)]/60 hover:bg-[var(--color-accent)]/30 transition-all duration-150"
                  title={tooltipText}
                  aria-label={`${user.name} is online`}
                  role="img"
                >
                  {initialsFromName(user.name)}
                  {/* Status dot */}
                  <span
                    className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--color-bg-primary)] shrink-0"
                    style={{ backgroundColor: dotColor }}
                    aria-hidden="true"
                  />
                  {/* Tooltip */}
                  <span className="pointer-events-none absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-[var(--color-border)] bg-[var(--color-bg-card)] px-2 py-1 text-[10px] font-medium text-[var(--color-text-primary)] shadow-md opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50">
                    {tooltipText}
                  </span>
                </div>
              )

              if (reduced) {
                return <div key={user.id}>{avatar}</div>
              }

              return (
                <motion.div
                  key={user.id}
                  layout
                  initial={{ opacity: 0, y: -6, scale: 0.92 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.92 }}
                  transition={{ duration: 0.2, ease: 'easeOut' }}
                >
                  {avatar}
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
