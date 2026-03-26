'use client'

import dynamic from 'next/dynamic'
import { Suspense } from 'react'
import { usePageTitle } from '@/hooks/usePageTitle'

const KarpenterPage = dynamic(() => import('./KarpenterPage'), { ssr: false })

export default function Page() {
  usePageTitle('Karpenter')

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <KarpenterPage />
    </Suspense>
  )
}
