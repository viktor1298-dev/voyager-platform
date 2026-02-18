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


test('treats legacy encrypted_key read errors as empty saved-key state', async () => {
  untypedClient.query.mockRejectedValueOnce(new Error('Failed query: select "encrypted_key" from user_ai_keys'))

  await expect(getAiKeySettings()).resolves.toBeNull()
  expect(untypedClient.query).toHaveBeenCalledTimes(1)
  expect(untypedClient.query).toHaveBeenNthCalledWith(1, 'aiKeys.get', undefined)
})

test('rethrows non-route QUERY errors on get path', async () => {
  const backendError = new Error('FORBIDDEN: denied by policy')
  untypedClient.query.mockRejectedValueOnce(backendError)

  await expect(getAiKeySettings()).rejects.toBe(backendError)
  expect(untypedClient.query).toHaveBeenCalledTimes(1)
  expect(untypedClient.query).toHaveBeenNthCalledWith(1, 'aiKeys.get', undefined)
})

test('falls back on structured NOT_FOUND tRPC shape (error.data.code)', async () => {
  untypedClient.query
    .mockRejectedValueOnce({
      message: 'No "query"-procedure on path "aiKeys.get"',
      data: { code: 'NOT_FOUND' },
    })
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

test('falls back mutation path from aiKeys.* to ai.keys.* on missing-procedure errors', async () => {
  untypedClient.mutation
    .mockRejectedValueOnce(new Error('No "mutation"-procedure on path "aiKeys.save"'))
    .mockResolvedValueOnce({
      key: {
        provider: 'openai',
        model: 'gpt-4o-mini',
        maskedKey: 'sk-proj-***',
        hasKey: true,
        updatedAt: null,
      },
    })

  await expect(
    upsertAiKeySettings({
      provider: 'openai',
      apiKey: 'sk-test',
      model: 'gpt-4o-mini',
    }),
  ).resolves.toEqual({
    provider: 'openai',
    model: 'gpt-4o-mini',
    maskedKey: 'sk-proj-***',
    hasKey: true,
    updatedAt: null,
  })

  expect(untypedClient.mutation).toHaveBeenCalledTimes(2)
  expect(untypedClient.mutation).toHaveBeenNthCalledWith(1, 'aiKeys.save', {
    provider: 'openai',
    apiKey: 'sk-test',
    model: 'gpt-4o-mini',
  })
  expect(untypedClient.mutation).toHaveBeenNthCalledWith(2, 'ai.keys.save', {
    provider: 'openai',
    apiKey: 'sk-test',
    model: 'gpt-4o-mini',
  })
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
