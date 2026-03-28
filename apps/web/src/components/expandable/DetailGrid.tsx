import type { ReactNode } from 'react'

interface DetailGridProps {
  children: ReactNode
}

export function DetailGrid({ children }: DetailGridProps) {
  return <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">{children}</div>
}
