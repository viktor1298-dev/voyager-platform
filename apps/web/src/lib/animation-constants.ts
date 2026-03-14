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
  spring: { type: 'spring' as const, stiffness: 300, damping: 30 },
  snappy: { type: 'spring' as const, stiffness: 500, damping: 40 },
  bouncy: { type: 'spring' as const, stiffness: 400, damping: 25, mass: 0.8 },
  exit: [0.4, 0, 1, 1] as [number, number, number, number],
  enter: [0, 0, 0.2, 1] as [number, number, number, number],
} as const

// Stagger delay between list items
export const STAGGER = {
  fast: 0.03,   // dense table rows
  normal: 0.05, // card grid
  slow: 0.08,   // hero cards
  max: 0.3,     // cap total stagger (10 items max effect)
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
  visible: { opacity: 1, scale: 1, transition: { duration: DURATION.normal, ease: EASING.default } },
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
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: DURATION.normal, ease: EASING.default } },
  exit: { opacity: 0, scale: 0.96, y: 4, transition: { duration: DURATION.fast, ease: EASING.exit } },
} as const

export const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: DURATION.fast } },
  exit: { opacity: 0, transition: { duration: DURATION.fast } },
} as const

// Card hover
export const cardHover = {
  scale: 1.01,
  transition: { duration: DURATION.fast },
} as const

export const cardTap = {
  scale: 0.995,
} as const

export const statusChangeTransition = {
  duration: DURATION.slow,
  ease: EASING.default,
} as const
