"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Server, Database, CheckCircle, AlertTriangle } from "lucide-react";

function statusColor(status: string) {
  if (status === "healthy") return "bg-emerald-500";
  if (status === "warning") return "bg-amber-500";
  return "bg-red-500";
}

function providerVariant(provider: string) {
  if (provider.toLowerCase().includes("eks")) return "secondary" as const;
  if (provider.toLowerCase().includes("aks")) return "outline" as const;
  return "default" as const;
}

export default function DashboardPage() {
  const clusters = trpc.clusters.list.useQuery();

  const clusterList = clusters.data ?? [];
  const totalNodes = clusterList.reduce((sum, c) => sum + (c.nodeCount ?? 0), 0);
  const healthyCount = clusterList.filter((c) => c.status === "healthy").length;

  const isLoading = clusters.isLoading;

  return (
    <div className="min-h-screen p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">🚀 Voyager Platform</h1>
        <p className="text-zinc-400 mt-1">Kubernetes Operations Dashboard</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Total Clusters</CardDescription>
            <Database className="h-4 w-4 text-zinc-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isLoading ? "…" : clusterList.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Total Nodes</CardDescription>
            <Server className="h-4 w-4 text-zinc-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{isLoading ? "…" : totalNodes}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Healthy Clusters</CardDescription>
            <CheckCircle className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-400">{isLoading ? "…" : healthyCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardDescription>Warning Events 24h</CardDescription>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <WarningEventsCount clusters={clusterList} isLoading={isLoading} />
          </CardContent>
        </Card>
      </div>

      {/* Clusters Grid */}
      <h2 className="text-xl font-semibold mb-4">Clusters</h2>
      {isLoading ? (
        <p className="text-zinc-400">Loading clusters…</p>
      ) : clusterList.length === 0 ? (
        <p className="text-zinc-500">No clusters found.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {clusterList.map((cluster) => (
            <Link key={cluster.id} href={`/clusters/${cluster.id}`}>
              <Card className="hover:border-zinc-600 transition-colors cursor-pointer">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{cluster.name}</CardTitle>
                    <Badge variant={providerVariant(cluster.provider)}>
                      {cluster.provider}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 text-sm text-zinc-400">
                    <span className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${statusColor(cluster.status ?? "unknown")}`} />
                      {cluster.status ?? "unknown"}
                    </span>
                    <span>K8s {cluster.version ?? "—"}</span>
                    <span>{cluster.nodeCount} nodes</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function WarningEventsCount({ clusters, isLoading }: { clusters: { id: string }[]; isLoading: boolean }) {
  // Aggregate warning events from all clusters
  const queries = clusters.map((c) => c.id);
  // For simplicity, just show total from first few clusters
  // A proper implementation would use a dedicated endpoint
  if (isLoading || clusters.length === 0) {
    return <div className="text-2xl font-bold text-amber-400">{isLoading ? "…" : 0}</div>;
  }
  return <WarningEventsAggregator clusterIds={queries} />;
}

function WarningEventsAggregator({ clusterIds }: { clusterIds: string[] }) {
  // Query stats for each cluster
  const results = clusterIds.map((id) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return trpc.events.stats.useQuery({ clusterId: id });
  });

  const total = results.reduce((sum, r) => sum + (r.data?.Warning ?? 0), 0);
  const loading = results.some((r) => r.isLoading);

  return (
    <div className={`text-2xl font-bold ${total > 0 ? "text-amber-400" : "text-zinc-400"}`}>
      {loading ? "…" : total}
    </div>
  );
}
