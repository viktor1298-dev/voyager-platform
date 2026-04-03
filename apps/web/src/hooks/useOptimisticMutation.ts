'use client'

import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

/**
 * Returns tRPC-compatible mutation options for optimistic updates.
 * Usage with tRPC:
 *   const opts = useOptimisticOptions({ ... })
 *   const mutation = trpc.something.useMutation(opts)
 */
export function useOptimisticOptions<TData, TVariables>({
  queryKey,
  updater,
  successMessage,
  errorMessage = 'Action failed, changes reverted',
  invalidateKeys,
  onSuccess: onSuccessCb,
}: {
  queryKey: readonly unknown[]
  updater: (old: TData | undefined, variables: TVariables) => TData
  successMessage?: string
  errorMessage?: string
  invalidateKeys?: readonly unknown[][]
  onSuccess?: () => void
}) {
  const queryClient = useQueryClient()

  return {
    onMutate: async (variables: TVariables) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<TData>(queryKey)
      queryClient.setQueryData<TData>(queryKey, (old) => updater(old, variables))
      return { previous }
    },
    onError: (err: unknown, _variables: TVariables, context: { previous?: TData } | undefined) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(queryKey, context.previous)
      }
      const serverMessage = err instanceof Error && err.message ? err.message : undefined
      toast.error(serverMessage || errorMessage)
    },
    onSuccess: () => {
      if (successMessage) toast.success(successMessage)
      onSuccessCb?.()
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey })
      if (invalidateKeys) {
        for (const key of invalidateKeys) {
          queryClient.invalidateQueries({ queryKey: key })
        }
      }
    },
  }
}
