"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";

export function TopBar() {
  const clusters = trpc.clusters.list.useQuery();
  const clusterList = clusters.data ?? [];

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

      {/* Center: Quick stats — non-overlapping with dashboard cards */}
      <div className="flex gap-6 items-center">
        <TotalPodsstat clusterIds={clusterList.map((c) => c.id)} loading={clusters.isLoading} />
        <Stat label="CPU Usage" value="—" color="var(--color-text-muted)" />
        <AlertsStat clusterIds={clusterList.map((c) => c.id)} loading={clusters.isLoading} />
      </div>

      {/* Right: Connection status */}
      <ConnectionStatus />
    </header>
  );
}

function ConnectionStatus() {
  const [secondsAgo, setSecondsAgo] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsAgo((prev) => prev + 30);
    }, 30_000);
    return () => clearInterval(interval);
  }, []);

  const label = secondsAgo === 0 ? "just now" : `${secondsAgo}s ago`;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--color-border)] bg-white/[0.02]">
      <span className="h-2 w-2 rounded-full bg-[var(--color-status-active)] animate-pulse" />
      <span className="text-[11px] text-[var(--color-text-primary)] font-mono font-medium">
        Connected
      </span>
      <span className="text-[10px] text-[var(--color-text-dim)]">·</span>
      <span className="text-[10px] text-[var(--color-text-muted)] font-mono">
        Synced {label}
      </span>
    </div>
  );
}

function TotalPodsstat({ clusterIds, loading }: { clusterIds: string[]; loading: boolean }) {
  // Query nodes for each cluster to sum pods
  const results = clusterIds.map((id) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return trpc.nodes.list.useQuery({ clusterId: id });
  });

  const anyLoading = loading || results.some((r) => r.isLoading);
  const totalPods = results.reduce((sum, r) => {
    const nodes = r.data ?? [];
    return sum + nodes.reduce((s, n) => s + (n.podsCount ?? 0), 0);
  }, 0);

  return <Stat label="Total Pods" value={anyLoading ? "…" : String(totalPods)} color="var(--color-accent)" />;
}

function AlertsStat({ clusterIds, loading }: { clusterIds: string[]; loading: boolean }) {
  const results = clusterIds.map((id) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return trpc.events.stats.useQuery({ clusterId: id });
  });

  const anyLoading = loading || results.some((r) => r.isLoading);
  const total = results.reduce((sum, r) => sum + (r.data?.Warning ?? 0), 0);

  return (
    <Stat
      label="Alerts"
      value={anyLoading ? "…" : String(total)}
      color={total > 0 ? "var(--color-status-warning)" : "var(--color-text-muted)"}
    />
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
