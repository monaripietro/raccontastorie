import type { ChatMessage } from './llmEngine'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
export const OPENROUTER_FREE_MODEL = 'openrouter/free'

type OpenRouterEngineOptions = {
  apiKey: string
  model?: string
}

export class OpenRouterEngine {
  private apiKey: string
  private model: string
  private abortController: AbortController | null = null

  constructor({ apiKey, model = OPENROUTER_FREE_MODEL }: OpenRouterEngineOptions) {
    this.apiKey = apiKey
    this.model = model
  }

  get isGenerating(): boolean {
    return this.abortController !== null
  }

  async generate(
    messages: ChatMessage[],
    callbacks?: {
      onFirstToken?: () => void
      onToken?: (content: string) => void
    },
  ): Promise<string> {
    if (this.abortController !== null) {
      throw new Error('Una generazione è già in corso')
    }
    this.abortController = new AbortController()
    const { signal } = this.abortController
    let firstTokenSeen = false
    let content = ''
    try {
      const response = await fetch(OPENROUTER_URL, {
        method: 'POST',
        signal,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': window.location.origin,
          'X-Title': 'Raccontastorie',
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          stream: true,
          temperature: 0.7,
          max_tokens: 800,
        }),
      })
      if (!response.ok || !response.body) {
        const errorText = await response.text().catch(() => '')
        throw new Error(
          `OpenRouter ha risposto ${response.status}. ${errorText.slice(0, 200)}`,
        )
      }
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data: ')) continue
          const payload = trimmed.slice(6)
          if (payload === '[DONE]') continue
          try {
            const chunk = JSON.parse(payload)
            const delta = chunk.choices?.[0]?.delta?.content ?? ''
            if (delta.length > 0) {
              if (!firstTokenSeen) {
                firstTokenSeen = true
                callbacks?.onFirstToken?.()
              }
              content += delta
              callbacks?.onToken?.(content)
            }
          } catch {
            // chunk incompleto: ignorato
          }
        }
      }
      return content
    } finally {
      this.abortController = null
    }
  }

  cancel(): void {
    this.abortController?.abort()
    this.abortController = null
  }
}
