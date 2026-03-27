import { TRPCError } from '@trpc/server'

/**
 * Standard error handler for K8s API operations in tRPC routers.
 * Re-throws TRPCErrors as-is. Maps 404s to NOT_FOUND. Everything else becomes INTERNAL_SERVER_ERROR.
 */
export function handleK8sError(error: unknown, operation: string): never {
  if (error instanceof TRPCError) throw error
  const msg = error instanceof Error ? error.message : 'Unknown error'
  if (msg.includes('404') || msg.includes('not found')) {
    throw new TRPCError({ code: 'NOT_FOUND', message: `${operation} not found` })
  }
  throw new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: `Failed to ${operation}: ${msg}`,
  })
}
