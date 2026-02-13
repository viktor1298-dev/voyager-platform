"use client";

import { createTRPCReact, httpBatchLink } from "@trpc/react-query";
import type { AppRouter } from "../../../api/src/routers/index";

export const trpc = createTRPCReact<AppRouter>();

export function getTRPCClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: "http://localhost:4000/trpc",
      }),
    ],
  });
}
