import { DEFAULT_MODEL_ID } from './modelConfig'

export type LlmStatus =
  | { phase: 'idle' }
  | { phase: 'loading'; progress: number; text: string }
  | { phase: 'ready' }
  | { phase: 'error'; error: string }

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

type WorkerResponse =
  | { type: 'load-progress'; progress: number; text: string }
  | { type: 'ready' }
  | { type: 'generated'; content: string }
  | { type: 'reset-ok' }
  | { type: 'error'; error: string }

type PendingGenerate = {
  resolve: (content: string) => void
  reject: (error: Error) => void
}

export class LlmEngine {
  private worker: Worker | null = null
  private pendingGenerate: PendingGenerate | null = null
  private pendingLoad: ((status: LlmStatus) => void) | null = null

  get isReady(): boolean {
    return this.worker !== null && this.pendingGenerate === null
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
          this.pendingLoad?.({ phase: 'ready' })
          this.pendingLoad = null
          onStatus({ phase: 'ready' })
          break
        }
        case 'generated': {
          const pending = this.pendingGenerate
          this.pendingGenerate = null
          pending?.resolve(data.content)
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
      this.pendingGenerate = null
      this.pendingLoad = null
      onStatus({ phase: 'error', error })
    }
    worker.postMessage({ type: 'load', modelId })
  }

  async generate(messages: ChatMessage[]): Promise<string> {
    const worker = this.worker
    if (!worker) {
      throw new Error('Il modello non è ancora pronto')
    }
    if (this.pendingGenerate) {
      throw new Error('Una generazione è già in corso')
    }
    return new Promise<string>((resolve, reject) => {
      this.pendingGenerate = { resolve, reject }
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
    this.pendingLoad = null
  }
}

export const llmEngine = new LlmEngine()
