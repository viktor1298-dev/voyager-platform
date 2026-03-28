'use client'

import { motion } from 'motion/react'
import { STAGGER } from '@/lib/animation-constants'

/** Map K8s verbs to CRUD letters */
const CRUD_MAP: { letter: string; verbs: string[] }[] = [
  { letter: 'C', verbs: ['create'] },
  { letter: 'R', verbs: ['get', 'list'] },
  { letter: 'U', verbs: ['update', 'patch'] },
  { letter: 'D', verbs: ['delete'] },
]

interface RbacCellProps {
  verbs: string[]
  onClick: () => void
  index?: number
}

export function RbacCell({ verbs, onClick, index = 0 }: RbacCellProps) {
  const verbSet = new Set(verbs)

  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: Math.min(index * STAGGER.fast, 0.3), duration: 0.15 }}
      className="flex items-center justify-center gap-0.5 min-w-[36px] min-h-[36px] px-1 rounded hover:bg-white/[0.06] dark:hover:bg-white/[0.06] transition-colors cursor-pointer"
      title={verbs.length > 0 ? `Verbs: ${verbs.join(', ')}` : 'No permissions'}
    >
      {CRUD_MAP.map(({ letter, verbs: mappedVerbs }) => {
        const hasPermission = mappedVerbs.some((v) => verbSet.has(v))

        return (
          <span
            key={letter}
            className={[
              'text-[12px] font-mono font-semibold leading-none select-none',
              hasPermission
                ? 'text-emerald-500 dark:text-emerald-400'
                : 'text-[var(--color-text-dim)] opacity-40',
            ].join(' ')}
          >
            {letter}
          </span>
        )
      })}
    </motion.button>
  )
}
