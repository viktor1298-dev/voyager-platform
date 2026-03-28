/**
 * Animation constants — single source of truth for all motion values.
 * Keep animations subtle and fast for a professional dashboard feel.
 */

// Durations (seconds)
export const DURATION = {
  instant: 0.08,
  fast: 0.15,
  normal: 0.2,
  slow: 0.3,
  page: 0.25,
  counter: 0.8,
  counterLarge: 1.2,
} as const

// Easings
export const EASING = {
  default: [0.25, 0.1, 0.25, 1] as [number, number, number, number],
  standard: [0.4, 0, 0.2, 1] as [number, number, number, number],
  decelerate: [0, 0, 0.2, 1] as [number, number, number, number],
  accelerate: [0.4, 0, 1, 1] as [number, number, number, number],
  spring: { type: 'spring' as const, stiffness: 350, damping: 24 },
  snappy: { type: 'spring' as const, stiffness: 500, damping: 40 },
  bouncy: { type: 'spring' as const, stiffness: 380, damping: 20, mass: 0.8 },
  exit: [0.4, 0, 1, 1] as [number, number, number, number],
  enter: [0, 0, 0.2, 1] as [number, number, number, number],
} as const

// Stagger delay between list items
export const STAGGER = {
  fast: 0.03, // dense table rows
  normal: 0.05, // card grid
  slow: 0.08, // hero cards
  max: 0.3, // cap total stagger (10 items max effect)
} as const

// Common animation variants
export const fadeVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: DURATION.normal, ease: EASING.default } },
  exit: { opacity: 0, transition: { duration: DURATION.fast, ease: EASING.exit } },
} as const

export const slideUpVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: DURATION.normal, ease: EASING.default } },
  exit: { opacity: 0, y: -4, transition: { duration: DURATION.fast, ease: EASING.exit } },
} as const

export const scaleVariants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: DURATION.normal, ease: EASING.default },
  },
  exit: { opacity: 0, scale: 0.95, transition: { duration: DURATION.fast, ease: EASING.exit } },
} as const

export const pageVariants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: { duration: DURATION.page, ease: EASING.default } },
  exit: { opacity: 0, y: -4, transition: { duration: DURATION.fast, ease: EASING.exit } },
} as const

export const listContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: STAGGER.fast, delayChildren: 0.05 },
  },
} as const

export const listItemVariants = {
  hidden: { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: { duration: DURATION.normal, ease: EASING.default } },
  exit: { opacity: 0, scale: 0.95, transition: { duration: DURATION.fast, ease: EASING.exit } },
} as const

export const dialogVariants = {
  hidden: { opacity: 0, scale: 0.96, y: 4 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { duration: DURATION.normal, ease: EASING.default },
  },
  exit: {
    opacity: 0,
    scale: 0.96,
    y: 4,
    transition: { duration: DURATION.fast, ease: EASING.exit },
  },
} as const

export const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: DURATION.fast } },
  exit: { opacity: 0, transition: { duration: DURATION.fast } },
} as const

// Card hover
export const cardHover = {
  y: -4,
  scale: 1.02,
  boxShadow: '0 12px 32px rgba(0,0,0,0.15)',
  transition: { type: 'spring' as const, stiffness: 350, damping: 24 },
} as const

export const cardTap = {
  scale: 0.98,
} as const

// IA-010: Dashboard IA Redesign animation constants
export const healthDotVariants = {
  healthy: { backgroundColor: 'var(--color-status-active)', scale: 1 as number },
  degraded: { backgroundColor: 'var(--color-status-warning)', scale: [1, 1.3, 1] as number[] },
  critical: { backgroundColor: 'var(--color-status-error)', scale: [1, 1.5, 1] as number[] },
}

export const statusChangeTransition = {
  duration: DURATION.slow,
  ease: EASING.default,
} as const

// checkButtonVariants removed — check button uses CSS opacity-0 group-hover:opacity-100 (no Motion conflict)

// Button micro-interactions (B-style)
export const buttonHover = {
  scale: 1.02,
  transition: { duration: DURATION.instant, ease: 'easeOut' as const },
} as const

export const buttonTap = {
  scale: 0.97,
  transition: { duration: DURATION.instant, ease: 'easeOut' as const },
} as const

// Status glow for alerts and critical indicators
export const glowVariants = {
  idle: { boxShadow: '0 0 0 rgba(0,0,0,0)' },
  warning: {
    boxShadow: [
      '0 0 0 rgba(245,158,11,0)',
      '0 0 12px rgba(245,158,11,0.4)',
      '0 0 0 rgba(245,158,11,0)',
    ],
    transition: { duration: 2, repeat: Infinity, ease: 'easeInOut' as const },
  },
  critical: {
    boxShadow: [
      '0 0 0 rgba(239,68,68,0)',
      '0 0 16px rgba(239,68,68,0.5)',
      '0 0 0 rgba(239,68,68,0)',
    ],
    transition: { duration: 1.5, repeat: Infinity, ease: 'easeInOut' as const },
  },
}

// Badge pop-in (bouncy spring)
export const badgePopVariants = {
  hidden: { scale: 0, opacity: 0 },
  visible: {
    scale: 1,
    opacity: 1,
    transition: { type: 'spring' as const, stiffness: 380, damping: 20, mass: 0.8 },
  },
  exit: { scale: 0, opacity: 0, transition: { duration: DURATION.fast } },
}

// Sort indicator rotation
export const sortRotateVariants = {
  asc: { rotate: 0, transition: { duration: DURATION.fast, ease: EASING.default } },
  desc: { rotate: 180, transition: { duration: DURATION.fast, ease: EASING.default } },
}

// Form error shake
export const errorShakeVariants = {
  idle: { x: 0 },
  shake: { x: [0, -8, 8, -6, 6, -3, 3, 0], transition: { duration: 0.5 } },
}

// SVG checkmark draw
export const successCheckVariants = {
  hidden: { pathLength: 0, opacity: 0 },
  visible: { pathLength: 1, opacity: 1, transition: { duration: 0.4, ease: EASING.decelerate } },
}

// Recharts animation config
export const CHART_ANIMATION = {
  duration: 800,
  durationFast: 600,
  easing: 'ease-out' as const,
  staggerDelay: 150,
} as const

// Alert entrance
export const alertEntranceVariants = {
  hidden: { opacity: 0, x: -12 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { type: 'spring' as const, stiffness: 350, damping: 24 },
  },
  exit: { opacity: 0, x: 12, scale: 0.95, transition: { duration: DURATION.fast } },
}

// Dropdown menu (grouped tab bar)
export const dropdownVariants = {
  hidden: { opacity: 0, scale: 0.95, y: -4 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: 'spring' as const, stiffness: 400, damping: 28 },
  },
  exit: { opacity: 0, scale: 0.95, y: -4, transition: { duration: 0.12, ease: EASING.exit } },
} as const

export const dropdownItemVariants = {
  hidden: { opacity: 0, x: -4 },
  visible: { opacity: 1, x: 0, transition: { duration: DURATION.fast, ease: EASING.default } },
} as const

// Expandable card/row
export const expandVariants = {
  collapsed: { height: 0, opacity: 0 },
  expanded: {
    height: 'auto',
    opacity: 1,
    transition: {
      height: { type: 'spring' as const, stiffness: 350, damping: 24 },
      opacity: { duration: DURATION.fast, delay: 0.05 },
    },
  },
  exit: {
    height: 0,
    opacity: 0,
    transition: {
      height: { duration: DURATION.fast, ease: EASING.exit },
      opacity: { duration: DURATION.instant },
    },
  },
} as const

export const chevronVariants = {
  collapsed: { rotate: 0 },
  expanded: { rotate: 180 },
} as const

// Detail tab content slide
export const tabSlideLeftVariants = {
  hidden: { opacity: 0, x: -8 },
  visible: { opacity: 1, x: 0, transition: { duration: DURATION.fast, ease: EASING.default } },
  exit: { opacity: 0, x: 8, transition: { duration: DURATION.instant, ease: EASING.exit } },
} as const

export const tabSlideRightVariants = {
  hidden: { opacity: 0, x: 8 },
  visible: { opacity: 1, x: 0, transition: { duration: DURATION.fast, ease: EASING.default } },
  exit: { opacity: 0, x: -8, transition: { duration: DURATION.instant, ease: EASING.exit } },
} as const

// Phase 9: Drawer slide-up (VS Code-style terminal panel)
export const drawerSlideUpVariants = {
  hidden: { y: '100%' },
  visible: { y: 0, transition: { type: 'spring' as const, stiffness: 350, damping: 24 } },
} as const

// Phase 9: Graph node appearance (topology map, network policy graph)
export const graphNodeVariants = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { type: 'spring' as const, stiffness: 350, damping: 24 },
  },
} as const

// Phase 9: Swim lane entrance (events timeline)
export const swimLaneVariants = {
  hidden: { opacity: 0, x: -12 },
  visible: { opacity: 1, x: 0 },
} as const

// Phase 9: Matrix cell fade (RBAC permission grid)
export const matrixCellVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
} as const

// Resource bar fill animation
export const resourceBarVariants = {
  hidden: { width: 0 },
  visible: (percent: number) => ({
    width: `${percent}%`,
    transition: { duration: 0.6, ease: EASING.decelerate },
  }),
} as const
