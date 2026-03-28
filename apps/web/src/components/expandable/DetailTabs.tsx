'use client'

import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, useRef, useState } from 'react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { EASING, tabSlideLeftVariants, tabSlideRightVariants } from '@/lib/animation-constants'

export interface DetailTab {
  id: string
  label: string
  icon?: ReactNode
  content: ReactNode
}

interface DetailTabsProps {
  id: string
  tabs: DetailTab[]
  defaultTab?: string
  /** Right-aligned actions rendered in the tab header row */
  actions?: ReactNode
}

export function DetailTabs({ id, tabs, defaultTab, actions }: DetailTabsProps) {
  const [activeTabId, setActiveTabId] = useState(defaultTab ?? tabs[0]?.id ?? '')
  const prevIndexRef = useRef<number>(tabs.findIndex((t) => t.id === activeTabId))
  const reducedMotion = useReducedMotion()

  const activeIndex = tabs.findIndex((t) => t.id === activeTabId)
  const activeTab = tabs[activeIndex]

  function handleTabChange(tabId: string) {
    if (tabId === activeTabId) return
    prevIndexRef.current = activeIndex
    setActiveTabId(tabId)
  }

  const newIndex = activeIndex
  const direction = newIndex > prevIndexRef.current ? 'right' : 'left'
  const contentVariants = reducedMotion
    ? {}
    : direction === 'right'
      ? tabSlideRightVariants
      : tabSlideLeftVariants

  return (
    <div>
      {/* Tab bar */}
      <div className="border-b border-[var(--color-border)]/60 px-4 flex items-center gap-1">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleTabChange(tab.id)}
              className={[
                'relative flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-colors duration-150',
                isActive
                  ? 'text-[var(--color-accent)]'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]',
              ].join(' ')}
            >
              {tab.icon && (
                <span className="shrink-0" style={{ fontSize: 13 }}>
                  {tab.icon}
                </span>
              )}
              {tab.label}
              {/* Active underline indicator */}
              {isActive && (
                <motion.div
                  layoutId={`detail-tab-${id}`}
                  className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full bg-[var(--color-accent)]"
                  transition={
                    reducedMotion
                      ? { duration: 0 }
                      : { type: 'spring', stiffness: 500, damping: 40 }
                  }
                />
              )}
            </button>
          )
        })}
        {actions && <div className="ml-auto flex items-center">{actions}</div>}
      </div>

      {/* Tab content */}
      <div className="relative overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          {activeTab && (
            <motion.div
              key={activeTab.id}
              variants={contentVariants}
              initial={reducedMotion ? false : 'hidden'}
              animate="visible"
              exit={reducedMotion ? undefined : 'exit'}
              className="p-4"
            >
              {activeTab.content}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
