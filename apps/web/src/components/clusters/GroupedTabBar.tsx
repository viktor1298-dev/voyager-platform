'use client'

import { AnimatePresence, motion } from 'motion/react'
import { ChevronDown } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { dropdownVariants, dropdownItemVariants, STAGGER, EASING } from '@/lib/animation-constants'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import {
  CLUSTER_TAB_ENTRIES,
  type ClusterTabEntry,
  type StandaloneTab,
  type TabGroup,
} from './cluster-tabs-config'

interface GroupedTabBarProps {
  clusterRouteSegment: string
  activeTab: string
}

export function GroupedTabBar({ clusterRouteSegment, activeTab }: GroupedTabBarProps) {
  const reduced = useReducedMotion()
  const [openGroupId, setOpenGroupId] = useState<string | null>(null)
  const groupRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  // Close dropdown on click outside
  useEffect(() => {
    if (!openGroupId) return
    const handler = (e: MouseEvent) => {
      const el = groupRefs.current.get(openGroupId)
      if (el && !el.contains(e.target as Node)) {
        setOpenGroupId(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [openGroupId])

  // Close dropdown on Escape
  useEffect(() => {
    if (!openGroupId) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenGroupId(null)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [openGroupId])

  const setGroupRef = useCallback((groupId: string, el: HTMLDivElement | null) => {
    if (el) {
      groupRefs.current.set(groupId, el)
    } else {
      groupRefs.current.delete(groupId)
    }
  }, [])

  const basePath = `/clusters/${clusterRouteSegment}`

  /** Check if a group contains the active tab */
  const getActiveChild = (group: TabGroup) => group.children.find((c) => c.id === activeTab) ?? null

  return (
    <div className="mb-3 border-b border-[var(--color-border)] overflow-x-auto">
      <nav className="flex items-end gap-0 min-w-max" aria-label="Cluster tabs">
        {CLUSTER_TAB_ENTRIES.map((entry) =>
          entry.type === 'standalone' ? (
            <StandaloneTabItem
              key={entry.id}
              tab={entry}
              basePath={basePath}
              isActive={activeTab === entry.id}
              reduced={reduced}
            />
          ) : (
            <GroupTabItem
              key={entry.id}
              group={entry}
              basePath={basePath}
              activeChild={getActiveChild(entry)}
              isOpen={openGroupId === entry.id}
              onToggle={() => setOpenGroupId(openGroupId === entry.id ? null : entry.id)}
              onClose={() => setOpenGroupId(null)}
              setRef={(el) => setGroupRef(entry.id, el)}
              reduced={reduced}
            />
          ),
        )}
      </nav>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Standalone Tab                                                     */
/* ------------------------------------------------------------------ */

function StandaloneTabItem({
  tab,
  basePath,
  isActive,
  reduced,
}: {
  tab: StandaloneTab
  basePath: string
  isActive: boolean
  reduced: boolean
}) {
  const Icon = tab.icon
  return (
    <Link
      href={`${basePath}${tab.path}`}
      data-testid={`cluster-tab-${tab.id}`}
      className={`relative flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium whitespace-nowrap transition-colors ${
        isActive
          ? 'text-[var(--color-text-primary)]'
          : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
      }`}
    >
      <Icon size={14} />
      {tab.label}
      {isActive && (
        <motion.div
          layoutId="cluster-tab-underline"
          className="absolute bottom-0 left-0 right-0 h-[3px] rounded-t-full bg-[var(--color-accent)]"
          transition={reduced ? { duration: 0 } : EASING.snappy}
        />
      )}
    </Link>
  )
}

/* ------------------------------------------------------------------ */
/*  Group Tab                                                          */
/* ------------------------------------------------------------------ */

function GroupTabItem({
  group,
  basePath,
  activeChild,
  isOpen,
  onToggle,
  onClose,
  setRef,
  reduced,
}: {
  group: TabGroup
  basePath: string
  activeChild: { id: string; label: string; path: string } | null
  isOpen: boolean
  onToggle: () => void
  onClose: () => void
  setRef: (el: HTMLDivElement | null) => void
  reduced: boolean
}) {
  const Icon = group.icon
  const isActive = !!activeChild
  const displayLabel = activeChild ? activeChild.label : group.label

  return (
    <div ref={setRef} className="relative">
      <button
        type="button"
        onClick={onToggle}
        data-testid={`cluster-tab-group-${group.id}`}
        className={`relative flex items-center gap-1.5 px-4 py-2.5 text-[13px] font-medium whitespace-nowrap transition-colors cursor-pointer ${
          isActive
            ? 'text-[var(--color-text-primary)]'
            : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
        }`}
      >
        <Icon size={14} />
        {displayLabel}
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={reduced ? { duration: 0 } : { duration: 0.15, ease: 'easeOut' }}
          className="inline-flex"
        >
          <ChevronDown size={12} />
        </motion.span>
        {isActive && (
          <motion.div
            layoutId="cluster-tab-underline"
            className="absolute bottom-0 left-0 right-0 h-[3px] rounded-t-full bg-[var(--color-accent)]"
            transition={reduced ? { duration: 0 } : EASING.snappy}
          />
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            variants={reduced ? undefined : dropdownVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="absolute top-full left-0 mt-1 z-50 min-w-[180px] bg-[var(--color-bg-card)] border border-[var(--color-border)] rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.3)] backdrop-blur-sm overflow-hidden"
          >
            <motion.div
              variants={
                reduced
                  ? undefined
                  : {
                      visible: {
                        transition: { staggerChildren: STAGGER.fast },
                      },
                    }
              }
              initial="hidden"
              animate="visible"
              className="py-1"
            >
              {group.children.map((child) => {
                const isChildActive = child.id === activeChild?.id
                return (
                  <motion.div key={child.id} variants={reduced ? undefined : dropdownItemVariants}>
                    <Link
                      href={`${basePath}${child.path}`}
                      data-testid={`cluster-tab-${child.id}`}
                      onClick={onClose}
                      className={`block px-3 py-2 text-[13px] transition-colors ${
                        isChildActive
                          ? 'text-[var(--color-accent)] bg-[var(--color-accent)]/[0.05] font-medium'
                          : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-white/[0.03]'
                      }`}
                    >
                      {child.label}
                    </Link>
                  </motion.div>
                )
              })}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
