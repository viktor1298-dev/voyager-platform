import { ConstellationLoader } from '@/components/animations/ConstellationLoader'

/**
 * Root-level loading — constellation animation during page transitions.
 */
export default function RootLoading() {
  return (
    <div
      className="flex h-screen w-full items-center justify-center"
      style={{ background: 'var(--color-bg-primary)' }}
    >
      <ConstellationLoader label="Loading..." />
    </div>
  )
}
