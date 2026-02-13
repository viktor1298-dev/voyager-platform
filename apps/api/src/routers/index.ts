import { router } from "../trpc";
import { clustersRouter } from "./clusters";
import { nodesRouter } from "./nodes";
import { eventsRouter } from "./events";

export const appRouter = router({
  clusters: clustersRouter,
  nodes: nodesRouter,
  events: eventsRouter,
});

export type AppRouter = typeof appRouter;
