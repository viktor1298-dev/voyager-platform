export const AI_CONFIG = {
  DEFAULT_PROVIDER: 'openai',
  DEFAULT_MODEL: 'gpt-4o-mini',
  REQUEST_TIMEOUT_MS: 45_000,
  MAX_OUTPUT_TOKENS: 1200,
  STREAM_HEARTBEAT_MS: 15_000,
} as const

export type AiProviderName = 'openai' | 'anthropic'
