import { DEFAULT_MODEL_ID } from './modelConfig'
import type { ChatMessage, LlmStatus } from '../types/story'

export type { ChatMessage, LlmStatus }

export type GenerateStats = {
  firstTokenMs: number
  tokens: number
  tokensPerSecond: number
}

type WorkerResponse =
  | { type: 'load-progress'; progress: number; text: string }
  | { type: 'ready' }
  | { type: 'first-token'; ms: number }
  | { type: 'token'; delta: string; content: string }
  | { type: 'generated'; content: string; stats: GenerateStats }
  | { type: 'reset-ok' }
  | { type: 'error'; error: string }

type PendingGenerate = {
  resolve: (value: { content: string; stats: GenerateStats | null }) => void
  reject: (error: Error) => void
  onFirstToken?: (ms: number) => void
  onToken?: (content: string) => void
}

export class LlmEngine {
  private worker: Worker | null = null
  private pendingGenerate: PendingGenerate | null = null

  get isGenerating(): boolean {
    return this.pendingGenerate !== null
  }

  load(
    onStatus: (status: LlmStatus) => void,
    modelId: string = DEFAULT_MODEL_ID,
  ): void {
    this.destroyWorker()
    const worker = new Worker(
      new URL('../workers/llmWorker.ts', import.meta.url),
      { type: 'module' },
    )
    this.worker = worker
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const { data } = event
      switch (data.type) {
        case 'load-progress': {
          onStatus({
            phase: 'loading',
            progress: data.progress,
            text: data.text,
          })
          break
        }
        case 'ready': {
          onStatus({ phase: 'ready' })
          break
        }
        case 'first-token': {
          this.pendingGenerate?.onFirstToken?.(data.ms)
          break
        }
        case 'token': {
          this.pendingGenerate?.onToken?.(data.content)
          break
        }
        case 'generated': {
          const pending = this.pendingGenerate
          this.pendingGenerate = null
          pending?.resolve({ content: data.content, stats: data.stats })
          break
        }
        case 'reset-ok': {
          break
        }
        case 'error': {
          const pending = this.pendingGenerate
          this.pendingGenerate = null
          pending?.reject(new Error(data.error))
          onStatus({ phase: 'error', error: data.error })
          break
        }
        default: {
          const exhaustive: never = data
          void exhaustive
        }
      }
    }
    worker.onerror = (event) => {
      const error = event.message || 'Errore del Web Worker LLM'
      const pending = this.pendingGenerate
      this.pendingGenerate = null
      pending?.reject(new Error(error))
      onStatus({ phase: 'error', error })
    }
    worker.postMessage({ type: 'load', modelId })
  }

  async generate(
    messages: ChatMessage[],
    callbacks?: {
      onFirstToken?: (ms: number) => void
      onToken?: (content: string) => void
    },
  ): Promise<string> {
    const worker = this.worker
    if (!worker) {
      throw new Error('Il modello non è ancora pronto')
    }
    if (this.pendingGenerate) {
      throw new Error('Una generazione è già in corso')
    }
    return new Promise<string>((resolve, reject) => {
      this.pendingGenerate = {
        resolve: (value) => resolve(value.content),
        reject,
        onFirstToken: callbacks?.onFirstToken,
        onToken: callbacks?.onToken,
      }
      worker.postMessage({ type: 'generate', messages })
    })
  }

  resetChat(): void {
    this.worker?.postMessage({ type: 'reset' })
  }

  destroyWorker(): void {
    this.worker?.terminate()
    this.worker = null
    this.pendingGenerate = null
  }
}

export const llmEngine = new LlmEngine()
