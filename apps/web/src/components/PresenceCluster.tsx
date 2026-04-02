'use client'

import { AnimatePresence, motion } from 'motion/react'
import { useMemo } from 'react'
import { usePresence } from '@/hooks/usePresence'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { useAuthStore } from '@/stores/auth'
import { scaleVariants } from '@/lib/animation-constants'

// Component-level constants — no hardcoded values
const MAX_VISIBLE = 5
const MAX_OVERFLOW_NAMES = 10
const AVATAR_SIZE = 'h-[26px] w-[26px]'
const AVATAR_OVERLAP = '-8px'
const DOT_SIZE = 'h-[7px] w-[7px]'

function initialsFromName(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export function PresenceCluster() {
  const reduced = useReducedMotion()
  const { onlineUsers } = usePresence()
  const currentUserId = useAuthStore((s) => s.user?.id)

  // Filter out current user — they're already visible in UserMenu
  const otherUsers = useMemo(
    () => onlineUsers.filter((u) => u.id !== currentUserId),
    [onlineUsers, currentUserId],
  )

  // Hidden when no other users are online
  if (otherUsers.length === 0) return null

  const visible = otherUsers.slice(0, MAX_VISIBLE)
  const overflow = otherUsers.slice(MAX_VISIBLE)

  const overflowTooltip =
    overflow.length > 0
      ? overflow.length <= MAX_OVERFLOW_NAMES
        ? overflow.map((u) => u.name).join(', ')
        : `${overflow
            .slice(0, MAX_OVERFLOW_NAMES)
            .map((u) => u.name)
            .join(', ')} and ${overflow.length - MAX_OVERFLOW_NAMES} more`
      : ''

  return (
    <div className="hidden sm:flex items-center" role="group" aria-label="Online users">
      <AnimatePresence initial={false}>
        {visible.map((user, i) => {
          const isOnline = user.status === 'online'
          const tooltipText = `${user.name}${user.currentPage && user.currentPage !== '/' ? ` · ${user.currentPage}` : ''}`

          // Positioning styles go on the wrapper (flex child), not the avatar
          const wrapperStyle = {
            zIndex: MAX_VISIBLE - i,
            marginLeft: i > 0 ? AVATAR_OVERLAP : undefined,
          }

          const avatar = (
            <div
              className={`group relative ${AVATAR_SIZE} rounded-full bg-[var(--color-bg-card)] border-[1.5px] border-[var(--color-border)] text-[10px] font-semibold text-[var(--color-text-muted)] flex items-center justify-center shrink-0 cursor-default hover:border-[var(--color-border-hover)] transition-colors duration-150`}
              aria-label={`${user.name} is ${user.status}`}
            >
              {initialsFromName(user.name)}
              {/* Status dot */}
              <span
                className={`absolute bottom-0 right-0 ${DOT_SIZE} rounded-full border-[1.5px] border-[var(--color-bg-primary)] transition-colors duration-150`}
                style={{
                  backgroundColor: isOnline
                    ? 'var(--color-status-active)'
                    : 'var(--color-text-dim)',
                }}
                aria-hidden="true"
              />
              {/* Tooltip */}
              <span className="pointer-events-none absolute bottom-full mb-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-[var(--color-border)] bg-[var(--color-bg-card)] px-2 py-1 text-xs font-medium text-[var(--color-text-primary)] shadow-md opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50">
                {tooltipText}
              </span>
            </div>
          )

          if (reduced) {
            return (
              <div key={user.id} style={wrapperStyle}>
                {avatar}
              </div>
            )
          }

          return (
            <motion.div
              key={user.id}
              style={wrapperStyle}
              variants={scaleVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              {avatar}
            </motion.div>
          )
        })}

        {/* +N overflow circle */}
        {overflow.length > 0 &&
          (() => {
            const overflowStyle = { zIndex: 0, marginLeft: AVATAR_OVERLAP }
            const overflowCircle = (
              <div
                className={`group relative ${AVATAR_SIZE} rounded-full bg-[var(--color-bg-card)] border-[1.5px] border-[var(--color-border)] text-[9px] font-bold font-mono text-[var(--color-text-dim)] flex items-center justify-center shrink-0 cursor-default hover:border-[var(--color-border-hover)] transition-colors duration-150`}
                aria-label={`${overflow.length} more users online`}
              >
                +{overflow.length}
                <span className="pointer-events-none absolute bottom-full mb-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-[var(--color-border)] bg-[var(--color-bg-card)] px-2 py-1 text-xs font-medium text-[var(--color-text-primary)] shadow-md opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50">
                  {overflowTooltip}
                </span>
              </div>
            )

            return reduced ? (
              <div key="overflow" style={overflowStyle}>
                {overflowCircle}
              </div>
            ) : (
              <motion.div
                key="overflow"
                style={overflowStyle}
                variants={scaleVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
              >
                {overflowCircle}
              </motion.div>
            )
          })()}
      </AnimatePresence>
    </div>
  )
}
