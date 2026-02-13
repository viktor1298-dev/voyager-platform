'use client'

import { useState } from 'react'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <>
      <TopBar />
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />
      <main
        className={`pt-14 min-h-screen transition-all duration-200 ${collapsed ? 'ml-12' : 'ml-48'}`}
      >
        <div className="p-6 max-w-[1400px]">{children}</div>
      </main>
    </>
  )
}
