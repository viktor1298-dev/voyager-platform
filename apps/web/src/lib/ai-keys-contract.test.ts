import assert from 'node:assert/strict'
import test from 'node:test'
import {
  mapBackendProviderToUi,
  mapUiProviderToBackend,
  normalizeGetResponse,
  normalizeSaveResponse,
  normalizeTestConnectionResponse,
} from './ai-keys-contract'

test('maps UI provider to backend provider at API boundary', () => {
  assert.equal(mapUiProviderToBackend('anthropic'), 'claude')
  assert.equal(mapUiProviderToBackend('openai'), 'openai')
})

test('parses get response using exact { keys: [...] } contract and hydrates hasKey', () => {
  const parsed = normalizeGetResponse({
    keys: [
      {
        provider: 'claude',
        model: 'claude-sonnet-4-20250514',
        maskedKey: 'sk-ant-***',
        updatedAt: '2026-02-18T04:00:00.000Z',
      },
    ],
  })

  assert.deepEqual(parsed, {
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

  assert.deepEqual(parsed, {
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
    provider: 'claude',
    model: 'claude-sonnet-4-20250514',
  })
  assert.deepEqual(ok, {
    ok: true,
    message: 'Connection succeeded (anthropic/claude-sonnet-4-20250514)',
  })

  const failed = normalizeTestConnectionResponse({ success: false, provider: 'openai' })
  assert.deepEqual(failed, {
    ok: false,
    message: 'Connection failed',
  })
})

test('maps backend provider to UI provider', () => {
  assert.equal(mapBackendProviderToUi('claude'), 'anthropic')
  assert.equal(mapBackendProviderToUi('openai'), 'openai')
})
