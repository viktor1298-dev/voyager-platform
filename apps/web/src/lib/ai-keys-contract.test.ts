import { expect, test } from 'vitest'
import {
  mapBackendProviderToUi,
  mapUiProviderToBackend,
  normalizeGetResponse,
  normalizeSaveResponse,
  normalizeTestConnectionResponse,
} from './ai-keys-contract'

test('maps UI provider to backend provider at API boundary', () => {
  expect(mapUiProviderToBackend('anthropic')).toBe('anthropic')
  expect(mapUiProviderToBackend('openai')).toBe('openai')
})

test('parses get response using exact { keys: [...] } contract and hydrates hasKey', () => {
  const parsed = normalizeGetResponse({
    keys: [
      {
        provider: 'anthropic',
        model: 'claude-sonnet-4-20250514',
        maskedKey: 'sk-ant-***',
        updatedAt: '2026-02-18T04:00:00.000Z',
      },
    ],
  })

  expect(parsed).toEqual({
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    maskedKey: 'sk-ant-***',
    hasKey: true,
    updatedAt: '2026-02-18T04:00:00.000Z',
  })
})

test('parses save response using exact { key: ... } contract', () => {
  const parsed = normalizeSaveResponse({
    key: {
      provider: 'openai',
      model: 'gpt-4o-mini',
      maskedKey: 'sk-proj-***',
      hasKey: true,
      updatedAt: null,
    },
  })

  expect(parsed).toEqual({
    provider: 'openai',
    model: 'gpt-4o-mini',
    maskedKey: 'sk-proj-***',
    hasKey: true,
    updatedAt: null,
  })
})

test('parses testConnection response using exact { success, provider, model } contract', () => {
  const ok = normalizeTestConnectionResponse({
    success: true,
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
  })
  expect(ok).toEqual({
    ok: true,
    message: 'Connection succeeded (anthropic/claude-sonnet-4-20250514)',
  })

  const failed = normalizeTestConnectionResponse({
    success: false,
    provider: 'openai',
    error: 'Invalid API key',
  })
  expect(failed).toEqual({
    ok: false,
    message: 'Invalid API key',
  })
})

test('maps backend provider to UI provider', () => {
  expect(mapBackendProviderToUi('claude')).toBe('anthropic')
  expect(mapBackendProviderToUi('anthropic')).toBe('anthropic')
  expect(mapBackendProviderToUi('openai')).toBe('openai')
  expect(mapBackendProviderToUi('gemini')).toBeNull()
})

test('rejects unknown provider values in get/save/testConnection responses', () => {
  expect(
    normalizeGetResponse({
      keys: [
        {
          provider: 'gemini',
          model: 'gemini-pro',
          maskedKey: '***',
          hasKey: true,
        },
      ],
    }),
  ).toBeNull()

  expect(
    normalizeSaveResponse({
      key: {
        provider: 'gemini',
        model: 'gemini-pro',
        maskedKey: '***',
        hasKey: true,
      },
    }),
  ).toBeNull()

  expect(
    normalizeTestConnectionResponse({
      success: true,
      provider: 'gemini',
      model: 'gemini-pro',
    }),
  ).toEqual({
    ok: false,
    message: 'Connection failed: invalid provider in response',
  })
})
