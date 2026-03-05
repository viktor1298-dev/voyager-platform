'use client'

import { AnomalyTimeline } from '@/components/dashboard/AnomalyTimeline'

export function AnomalyTimelineWidget() {
  return (
    <div className="h-full overflow-auto">
      <AnomalyTimeline />
    </div>
  )
}
