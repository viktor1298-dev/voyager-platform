import { z } from "zod";
import { eq, sql, count } from "drizzle-orm";
import { clusters, nodes } from "@voyager/db";
import { router, publicProcedure } from "../trpc";

export const clustersRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    const allClusters = await ctx.db.select().from(clusters);
    const nodeCounts = await ctx.db
      .select({
        clusterId: nodes.clusterId,
        count: count().as("count"),
      })
      .from(nodes)
      .groupBy(nodes.clusterId);
    const countMap = new Map(nodeCounts.map((n) => [n.clusterId, n.count]));
    return allClusters.map((c) => ({
      ...c,
      nodeCount: countMap.get(c.id) ?? 0,
    }));
  }),

  get: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [cluster] = await ctx.db
        .select()
        .from(clusters)
        .where(eq(clusters.id, input.id));
      if (!cluster) throw new Error("Cluster not found");
      const clusterNodes = await ctx.db
        .select()
        .from(nodes)
        .where(eq(nodes.clusterId, input.id));
      return { ...cluster, nodes: clusterNodes };
    }),

  create: publicProcedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        provider: z.string().min(1).max(50),
        endpoint: z.string().url().max(500),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db.insert(clusters).values(input).returning();
      return created;
    }),

  update: publicProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        status: z.string().max(50).optional(),
        version: z.string().max(50).optional(),
        nodesCount: z.number().int().min(0).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const updates: Record<string, unknown> = {};
      if (data.status !== undefined) updates.status = data.status;
      if (data.version !== undefined) updates.version = data.version;
      if (data.nodesCount !== undefined) updates.nodesCount = data.nodesCount;
      const [updated] = await ctx.db
        .update(clusters)
        .set(updates)
        .where(eq(clusters.id, id))
        .returning();
      if (!updated) throw new Error("Cluster not found");
      return updated;
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [deleted] = await ctx.db
        .delete(clusters)
        .where(eq(clusters.id, input.id))
        .returning();
      if (!deleted) throw new Error("Cluster not found");
      return deleted;
    }),
});
