"use client";

import { trpc } from "@/lib/trpc";

export function TopBar() {
  const clusters = trpc.clusters.list.useQuery();
  const clusterList = clusters.data ?? [];
  const totalNodes = clusterList.reduce((sum, c) => sum + (c.nodeCount ?? 0), 0);
  const healthyCount = clusterList.filter((c) => c.status === "healthy").length;
  const healthyPct = clusterList.length > 0 ? ((healthyCount / clusterList.length) * 100).toFixed(0) : "—";
  return (
    <header className="fixed top-0 left-0 right-0 h-14 z-50 flex items-center justify-between px-6 border-b border-[var(--color-border)] bg-[var(--color-bg-primary)]/95 backdrop-blur-lg">
      {/* Left: Logo */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[var(--color-accent)] to-indigo-600 flex items-center justify-center text-white text-base shadow-lg shadow-indigo-500/20">
          🚀
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-base font-extrabold bg-gradient-to-r from-[var(--color-text-primary)] to-[var(--color-text-secondary)] bg-clip-text text-transparent tracking-tight">
            Voyager
          </span>
          <span className="text-[10px] text-[var(--color-text-dim)] font-mono tracking-wider">
            PLATFORM
          </span>
        </div>
      </div>

      {/* Center: Quick stats */}
      <div className="flex gap-6 items-center">
        <Stat label="Clusters" value={clusters.isLoading ? "…" : String(clusterList.length)} color="var(--color-accent)" />
        <Stat label="Nodes" value={clusters.isLoading ? "…" : String(totalNodes)} color="var(--color-text-secondary)" />
        <Stat label="Healthy" value={clusters.isLoading ? "…" : `${healthyPct}%`} color="var(--color-status-active)" />
      </div>

      {/* Right: K8s version + status */}
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--color-border)] bg-white/[0.02]">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-status-active)] animate-pulse" />
        <span className="text-[11px] text-[var(--color-text-muted)] font-mono">
          Voyager v0.1.0
        </span>
      </div>
    </header>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="text-center">
      <div className="text-sm font-extrabold leading-none" style={{ color }}>
        {value}
      </div>
      <div className="text-[9px] text-[var(--color-text-dim)] uppercase tracking-wider mt-0.5 font-mono">
        {label}
      </div>
    </div>
  );
}
