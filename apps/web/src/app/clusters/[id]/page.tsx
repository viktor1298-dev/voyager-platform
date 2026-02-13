"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { trpc } from "@/lib/trpc";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default function ClusterDetailPage() {
  const { id } = useParams<{ id: string }>();
  const cluster = trpc.clusters.get.useQuery({ id });

  if (cluster.isLoading) return <div className="p-8 text-zinc-400">Loading…</div>;
  if (cluster.error) return <div className="p-8 text-red-400">Error: {cluster.error.message}</div>;

  const data = cluster.data!;

  return (
    <div className="min-h-screen p-8 max-w-4xl mx-auto">
      <Link href="/" className="text-blue-400 hover:underline text-sm">← Back to Dashboard</Link>
      <h1 className="text-2xl font-bold mt-4">{data.name}</h1>
      <p className="text-zinc-400">Cluster detail page — coming soon</p>

      <Card className="mt-6">
        <CardHeader><CardTitle>Info</CardTitle></CardHeader>
        <CardContent>
          <pre className="text-sm text-zinc-300">{JSON.stringify(data, null, 2)}</pre>
        </CardContent>
      </Card>
    </div>
  );
}
