import { AI_CONFIG, type AiProviderName } from '@voyager/config'

export type AiChatRole = 'system' | 'user' | 'assistant'

export interface AiChatMessage {
  role: AiChatRole
  content: string
}

export interface AiProviderConfig {
  provider: AiProviderName
  model: string
  apiKey: string
  baseUrl?: string
  timeoutMs: number
  maxOutputTokens: number
}

export interface AiCompletionRequest {
  messages: AiChatMessage[]
  temperature?: number
}

export interface AiStreamCallbacks {
  onToken: (token: string) => Promise<void> | void
  onComplete?: () => Promise<void> | void
}

export function readAiProviderConfigFromEnv(): AiProviderConfig {
  const provider = (process.env.AI_PROVIDER ?? AI_CONFIG.DEFAULT_PROVIDER) as AiProviderName
  const model = process.env.AI_MODEL ?? AI_CONFIG.DEFAULT_MODEL
  const timeoutMs = Number.parseInt(
    process.env.AI_TIMEOUT_MS ?? `${AI_CONFIG.REQUEST_TIMEOUT_MS}`,
    10,
  )
  const maxOutputTokens = Number.parseInt(
    process.env.AI_MAX_OUTPUT_TOKENS ?? `${AI_CONFIG.MAX_OUTPUT_TOKENS}`,
    10,
  )

  if (provider === 'anthropic') {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is required when AI_PROVIDER=anthropic')
    }

    return {
      provider,
      model,
      apiKey,
      baseUrl: process.env.ANTHROPIC_BASE_URL,
      timeoutMs,
      maxOutputTokens,
    }
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required when AI_PROVIDER=openai')
  }

  return {
    provider: 'openai',
    model,
    apiKey,
    baseUrl: process.env.OPENAI_BASE_URL,
    timeoutMs,
    maxOutputTokens,
  }
}

function withTimeout(ms: number): AbortSignal {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), ms)
  controller.signal.addEventListener('abort', () => clearTimeout(id), { once: true })
  return controller.signal
}

export class AiProviderClient {
  public constructor(private readonly config: AiProviderConfig) {}

  public get metadata(): Pick<AiProviderConfig, 'provider' | 'model'> {
    return {
      provider: this.config.provider,
      model: this.config.model,
    }
  }

  public async complete(input: AiCompletionRequest): Promise<string> {
    const chunks: string[] = []
    await this.stream(input, {
      onToken: (token) => {
        chunks.push(token)
      },
    })

    return chunks.join('')
  }

  public async stream(input: AiCompletionRequest, callbacks: AiStreamCallbacks): Promise<void> {
    if (this.config.provider === 'anthropic') {
      await this.streamAnthropic(input, callbacks)
      return
    }

    await this.streamOpenAi(input, callbacks)
  }

  private async streamOpenAi(
    input: AiCompletionRequest,
    callbacks: AiStreamCallbacks,
  ): Promise<void> {
    const baseUrl = this.config.baseUrl ?? 'https://api.openai.com/v1'
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: input.messages,
        temperature: input.temperature ?? 0.2,
        max_tokens: this.config.maxOutputTokens,
        stream: true,
      }),
      signal: withTimeout(this.config.timeoutMs),
    })

    if (!response.ok || !response.body) {
      throw new Error(`OpenAI request failed: ${response.status} ${await response.text()}`)
    }

    const decoder = new TextDecoder()
    let buffer = ''

    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue

        const payload = trimmed.replace(/^data:\s*/, '')
        if (payload === '[DONE]') {
          await callbacks.onComplete?.()
          return
        }

        try {
          const parsed = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string } }>
          }
          const token = parsed.choices?.[0]?.delta?.content
          if (token) {
            await callbacks.onToken(token)
          }
        } catch {
          // Ignore malformed stream payloads and continue reading.
        }
      }
    }

    await callbacks.onComplete?.()
  }

  private async streamAnthropic(
    input: AiCompletionRequest,
    callbacks: AiStreamCallbacks,
  ): Promise<void> {
    const baseUrl = this.config.baseUrl ?? 'https://api.anthropic.com/v1'
    const response = await fetch(`${baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: this.config.maxOutputTokens,
        stream: true,
        messages: input.messages
          .filter((message) => message.role !== 'system')
          .map((message) => ({ role: message.role, content: message.content })),
        ...(input.messages.find((message) => message.role === 'system')
          ? {
              system: input.messages
                .filter((message) => message.role === 'system')
                .map((message) => message.content)
                .join('\n'),
            }
          : {}),
      }),
      signal: withTimeout(this.config.timeoutMs),
    })

    if (!response.ok || !response.body) {
      throw new Error(`Anthropic request failed: ${response.status} ${await response.text()}`)
    }

    const decoder = new TextDecoder()
    let buffer = ''

    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue

        const payload = trimmed.replace(/^data:\s*/, '')
        if (!payload || payload === '[DONE]') continue

        try {
          const parsed = JSON.parse(payload) as {
            type?: string
            delta?: { text?: string }
          }
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            await callbacks.onToken(parsed.delta.text)
          }
        } catch {
          // Ignore malformed stream payloads and continue reading.
        }
      }
    }

    await callbacks.onComplete?.()
  }
}
