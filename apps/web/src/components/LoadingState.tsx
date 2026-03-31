'use client'

import { ConstellationLoader } from '@/components/animations/ConstellationLoader'

export function LoadingState({ message = 'Loading...' }: { message?: string }) {
  return <ConstellationLoader label={message} />
}
