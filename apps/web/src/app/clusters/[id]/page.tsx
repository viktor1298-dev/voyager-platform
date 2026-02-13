"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft } from "lucide-react";

function statusColor(status: string) {
  if (status === "healthy") return "bg-emerald-500";
  if (status === "warning") return "bg-amber-500";
  return "bg-red-500";
}

function nodeStatusColor(status: string) {
  if (status === "Ready") return "bg-emerald-500";
  if (status === "NotReady") return "bg-red-500";
  return "bg-zinc-500";
}

function formatCPU(millicores: number | null | undefined): string {
  if (millicores == null) return "—";
  if (millicores >= 1000) return `${(millicores / 1000).toFixed(1)} cores`;
  return `${millicores}m`;
}

function formatMemory(bytes: number | null | undefined): string {
  if (bytes == null) return "—";
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(0)} MB`;
}

function formatTimestamp(ts: string | Date): string {
  const d = new Date(ts);
  return d.toLocaleString("en-IL", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function ClusterDetailPage() {
  const { id } = useParams<{ id: string }>();
  const cluster = trpc.clusters.get.useQuery({ id });
  const nodesQuery = trpc.nodes.list.useQuery({ clusterId: id });
  const eventsQuery = trpc.events.list.useQuery({ clusterId: id, limit: 20 });

  if (cluster.isLoading) {
    return (
      <div className="min-h-screen p-8 max-w-7xl mx-auto">
        <Skeleton className="h-6 w-40 mb-4" />
        <Skeleton className="h-10 w-72 mb-2" />
        <Skeleton className="h-5 w-48 mb-8" />
        <Skeleton className="h-64 w-full mb-6" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (cluster.error) {
    return (
      <div className="min-h-screen p-8 max-w-7xl mx-auto">
        <Link href="/" className="text-blue-400 hover:underline text-sm flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Back to Dashboard
        </Link>
        <p className="text-red-400 mt-4">Error: {cluster.error.message}</p>
      </div>
    );
  }

  const data = cluster.data!;
  const nodeList = nodesQuery.data ?? [];
  const eventList = eventsQuery.data ?? [];

  return (
    <div className="min-h-screen p-8 max-w-7xl mx-auto">
      {/* Back button */}
      <Link href="/" className="text-blue-400 hover:underline text-sm flex items-center gap-1 mb-6">
        <ArrowLeft className="h-4 w-4" /> Back to Dashboard
      </Link>

      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <h1 className="text-3xl font-bold text-white">{data.name}</h1>
        <Badge variant={data.status === "healthy" ? "default" : "destructive"}>
          <span className={`inline-block h-2 w-2 rounded-full mr-1.5 ${statusColor(data.status ?? "unknown")}`} />
          {data.status ?? "unknown"}
        </Badge>
        <Badge variant="secondary">{data.provider}</Badge>
      </div>
      <p className="text-zinc-400 mb-8">Kubernetes {data.version ?? "—"}</p>

      {/* Nodes Table */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Nodes ({nodeList.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {nodesQuery.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : nodeList.length === 0 ? (
            <p className="text-zinc-500">No nodes found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>CPU</TableHead>
                  <TableHead>Memory</TableHead>
                  <TableHead>Pods</TableHead>
                  <TableHead>K8s Version</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {nodeList.map((node) => (
                  <TableRow key={node.id}>
                    <TableCell className="font-medium">{node.name}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-1.5">
                        <span className={`h-2 w-2 rounded-full ${nodeStatusColor(node.status)}`} />
                        {node.status}
                      </span>
                    </TableCell>
                    <TableCell>{node.role}</TableCell>
                    <TableCell>
                      {formatCPU(node.cpuAllocatable)} / {formatCPU(node.cpuCapacity)}
                    </TableCell>
                    <TableCell>
                      {formatMemory(node.memoryAllocatable)} / {formatMemory(node.memoryCapacity)}
                    </TableCell>
                    <TableCell>{node.podsCount}</TableCell>
                    <TableCell>{node.k8sVersion ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Events Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Events</CardTitle>
        </CardHeader>
        <CardContent>
          {eventsQuery.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : eventList.length === 0 ? (
            <p className="text-zinc-500">No events found.</p>
          ) : (
            <div className="space-y-3">
              {eventList.map((event) => (
                <div
                  key={event.id}
                  className="flex items-start gap-3 border-l-2 pl-4 py-2 border-zinc-700"
                >
                  <div className="flex-shrink-0 pt-0.5">
                    <Badge
                      variant={event.kind === "Warning" ? "destructive" : "secondary"}
                      className={
                        event.kind === "Warning"
                          ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                          : "bg-blue-500/20 text-blue-400 border-blue-500/30"
                      }
                    >
                      {event.kind}
                    </Badge>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium text-zinc-200">{event.reason ?? "—"}</span>
                      {event.namespace && (
                        <span className="text-zinc-500 text-xs">ns/{event.namespace}</span>
                      )}
                    </div>
                    <p className="text-sm text-zinc-400 mt-0.5 break-words">{event.message ?? ""}</p>
                  </div>
                  <span className="text-xs text-zinc-500 flex-shrink-0">
                    {formatTimestamp(event.timestamp)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
