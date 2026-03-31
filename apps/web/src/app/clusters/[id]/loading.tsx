import { ConstellationLoader } from '@/components/animations/ConstellationLoader'

/**
 * Cluster detail loading — constellation animation during page navigation.
 */
export default function ClusterDetailLoading() {
  return (
    <div className="p-6">
      <ConstellationLoader label="Loading cluster..." />
    </div>
  )
}
