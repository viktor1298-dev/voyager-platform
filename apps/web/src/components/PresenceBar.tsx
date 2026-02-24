'use client'

import { AnimatePresence, motion } from 'motion/react'
import { usePresence } from '@/hooks/usePresence'
import { useReducedMotion } from '@/hooks/useReducedMotion'

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

  const count = onlineUsers.length

  return (
    <div className="h-10 border-b border-[var(--color-border)] bg-[var(--color-bg-primary)]/85 backdrop-blur-lg flex items-center px-3 sm:px-6">
      <div className="flex items-center gap-2 min-w-0">
        {/* Presence icon — pulsing green dot */}
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

      <div className="ml-4 flex items-center gap-2 overflow-x-auto">
        <AnimatePresence initial={false}>
          {onlineUsers.map((user) => {
            const dotColor = user.status === 'online'
              ? 'var(--color-status-active, #22c55e)'
              : 'var(--color-text-dim)'

            const avatar = (
              <div
                className="relative h-7 w-7 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[10px] font-semibold text-[var(--color-text-primary)] flex items-center justify-center shrink-0"
                title={`${user.name} • ${user.currentPage}`}
                aria-label={`${user.name} is on ${user.currentPage}`}
              >
                {initialsFromName(user.name)}
                <span
                  className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-[var(--color-bg-primary)]"
                  style={{ backgroundColor: dotColor }}
                />
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
    </div>
  )
}
