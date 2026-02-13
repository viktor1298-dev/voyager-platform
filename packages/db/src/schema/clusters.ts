import { pgTable, uuid, varchar, integer, timestamp } from "drizzle-orm/pg-core";

export const clusters = pgTable("clusters", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  provider: varchar("provider", { length: 50 }).notNull(), // eks/aks/gke/on-prem/minikube
  endpoint: varchar("endpoint", { length: 500 }).notNull(), // K8s API URL
  status: varchar("status", { length: 50 }).notNull().default("unreachable"), // healthy/degraded/unreachable
  version: varchar("version", { length: 50 }), // K8s version
  nodesCount: integer("nodes_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});
