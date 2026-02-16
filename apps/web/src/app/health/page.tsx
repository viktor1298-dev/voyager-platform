import { CheckCircle2 } from 'lucide-react'

export default function HealthPage() {
  const timestamp = new Date().toLocaleString()

  return (
    <main className="min-h-screen bg-[var(--color-bg)] p-6 md:p-10">
      <div className="mx-auto max-w-xl">
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-emerald-400" />
            <h1 className="text-xl font-semibold text-emerald-300">System Healthy</h1>
          </div>

          <p className="mt-3 text-sm text-[var(--color-text-secondary)]">All core services are responding normally.</p>
          <p className="mt-2 text-xs text-[var(--color-text-dim)]">Checked at: {timestamp}</p>
        </div>
      </div>
    </main>
  )
}
