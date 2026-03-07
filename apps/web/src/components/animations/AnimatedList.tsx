'use client'

import { AnimatePresence, m } from 'motion/react'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { listContainerVariants, listItemVariants } from '@/lib/animation-constants'
import type { ReactNode } from 'react'

interface AnimatedListProps<T> {
  items: T[]
  keyExtractor: (item: T) => string
  renderItem: (item: T, index: number) => ReactNode
  className?: string
  itemClassName?: string
  layout?: boolean
}

export function AnimatedList<T>({
  items,
  keyExtractor,
  renderItem,
  className,
  itemClassName,
  layout = true,
}: AnimatedListProps<T>) {
  const reduced = useReducedMotion()

  if (reduced) {
    return (
      <div className={className}>
        {items.map((item, i) => (
          <div key={keyExtractor(item)} className={itemClassName}>
            {renderItem(item, i)}
          </div>
        ))}
      </div>
    )
  }

  return (
    <m.div
      className={className}
      variants={listContainerVariants}
      initial="hidden"
      animate="visible"
    >
      <AnimatePresence mode="popLayout">
        {items.map((item, i) => (
          <m.div
            key={keyExtractor(item)}
            className={itemClassName}
            variants={listItemVariants}
            layout={layout}
            exit="exit"
          >
            {renderItem(item, i)}
          </m.div>
        ))}
      </AnimatePresence>
    </m.div>
  )
}
