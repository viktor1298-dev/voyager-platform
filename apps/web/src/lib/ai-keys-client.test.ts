import { beforeEach, expect, test, vi } from 'vitest'

const untypedClient = {
  query: vi.fn(),
  mutation: vi.fn(),
}

vi.mock('@trpc/client', () => ({
  createTRPCClientProxy: vi.fn(() => ({})),
  getUntypedClient: vi.fn(() => untypedClient),
}))

vi.mock('@/lib/trpc', () => ({
  getTRPCClient: vi.fn(() => ({})),
}))

vi.mock('@/lib/ai-keys-contract', () => ({
  mapUiProviderToBackend: vi.fn((provider: string) => provider),
  normalizeGetResponse: vi.fn((payload: any) => payload?.keys?.[0] ?? null),
  normalizeSaveResponse: vi.fn((payload: any) => payload?.key ?? payload ?? null),
  normalizeTestConnectionResponse: vi.fn((payload: any) => payload),
}))

import { getAiKeySettings, upsertAiKeySettings } from './ai-keys-client'

beforeEach(() => {
  untypedClient.query.mockReset()
  untypedClient.mutation.mockReset()
})

test('falls back to legacy query path only for missing-procedure/path errors', async () => {
  untypedClient.query
    .mockRejectedValueOnce(new Error('No procedure found on path "aiKeys.get"'))
    .mockResolvedValueOnce({
      keys: [
        {
          provider: 'openai',
          model: 'gpt-4o-mini',
          maskedKey: 'sk-proj-***',
          hasKey: true,
          updatedAt: null,
        },
      ],
    })

  await expect(getAiKeySettings()).resolves.toEqual({
    provider: 'openai',
    model: 'gpt-4o-mini',
    maskedKey: 'sk-proj-***',
    hasKey: true,
    updatedAt: null,
  })

  expect(untypedClient.query).toHaveBeenCalledTimes(2)
  expect(untypedClient.query).toHaveBeenNthCalledWith(1, 'aiKeys.get', undefined)
  expect(untypedClient.query).toHaveBeenNthCalledWith(2, 'ai.keys.get', undefined)
})

test('rethrows non-route backend errors instead of collapsing to route unavailable', async () => {
  const backendError = new Error('UNAUTHORIZED: session expired')
  untypedClient.mutation.mockRejectedValueOnce(backendError)

  await expect(
    upsertAiKeySettings({
      provider: 'openai',
      apiKey: 'sk-test',
      model: 'gpt-4o-mini',
    }),
  ).rejects.toBe(backendError)

  expect(untypedClient.mutation).toHaveBeenCalledTimes(1)
})
