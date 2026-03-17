'use client'

import { AppLayout } from '@/components/AppLayout'
import { PageTransition } from '@/components/animations'
import { Breadcrumbs } from '@/components/Breadcrumbs'
import { LayoutDashboard, Sparkles } from 'lucide-react'
import { usePageTitle } from '@/hooks/usePageTitle'

export default function DashboardsPage() {
  usePageTitle('Dashboards')

  return (
    <AppLayout>
      <PageTransition>
      <Breadcrumbs />

      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
        {/* Icon */}
        <div className="relative">
          <div className="h-20 w-20 rounded-2xl bg-gradient-to-br from-[var(--color-accent)]/20 to-indigo-600/20 border border-[var(--color-accent)]/30 flex items-center justify-center">
            <LayoutDashboard className="h-10 w-10 text-[var(--color-accent)]" />
          </div>
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--color-accent)] text-white text-xs">
            <Sparkles className="h-3 w-3" />
          </span>
        </div>

        {/* Heading */}
        <div className="space-y-2 max-w-md">
          <h1 className="text-2xl font-extrabold tracking-tight text-[var(--color-text-primary)]">
            Shared Dashboards
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
            Create and share custom dashboards with your team. Pin metrics, charts, and cluster
            summaries into a single view.
          </p>
        </div>

        {/* Coming Soon badge */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 text-[var(--color-accent)] text-xs font-mono font-semibold tracking-wider uppercase">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)] animate-pulse" />
          Coming Soon
        </div>

        {/* Info cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 w-full max-w-xl">
          {[
            { label: 'Custom Layouts', desc: 'Drag-and-drop dashboard builder' },
            { label: 'Team Sharing', desc: 'Share with teammates or make public' },
            { label: 'Live Metrics', desc: 'Real-time cluster data widgets' },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4 text-left"
            >
              <p className="text-xs font-semibold text-[var(--color-text-primary)] mb-1">
                {item.label}
              </p>
              <p className="text-xs text-[var(--color-text-dim)]">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
      </PageTransition>
    </AppLayout>
  )
}
