'use client'

import dynamic from 'next/dynamic'
import { Suspense } from 'react'

const KarpenterPage = dynamic(() => import('./KarpenterPage'), { ssr: false })

export default function Page() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <KarpenterPage />
    </Suspense>
  )
}
