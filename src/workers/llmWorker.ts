import * as webllm from '@mlc-ai/web-llm'
import { DEFAULT_MODEL_ID } from '../services/modelConfig'

export { DEFAULT_MODEL_ID }

type WorkerRequest =
  | { type: 'load'; modelId: string }
  | { type: 'generate'; messages: webllm.ChatCompletionMessageParam[] }
  | { type: 'reset' }

type LoadProgress = {
  progress: number
  text: string
}

let engine: webllm.MLCEngineInterface | null = null
let generating = false

async function handleLoad(
  modelId: string,
  postProgress: (p: LoadProgress) => void,
): Promise<void> {
  engine = await webllm.CreateMLCEngine(modelId, {
    initProgressCallback: (report) => {
      postProgress({
        progress: Math.round(report.progress * 100),
        text: report.text ?? '',
      })
    },
  })
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { data } = event
  const postProgress = (p: LoadProgress) =>
    self.postMessage({ type: 'load-progress', ...p })
  try {
    switch (data.type) {
      case 'load': {
        await handleLoad(data.modelId, postProgress)
        self.postMessage({ type: 'ready' })
        break
      }
      case 'generate': {
        if (!engine) {
          self.postMessage({ type: 'error', error: 'Modello non caricato' })
          return
        }
        if (generating) {
          self.postMessage({
            type: 'error',
            error: 'Una generazione è già in corso',
          })
          return
        }
        generating = true
        const startedAt = performance.now()
        let firstTokenAt = 0
        let tokens = 0
        let content = ''
        const chunks = await engine.chat.completions.create({
          messages: data.messages,
          stream: true,
          temperature: 0.7,
          max_tokens: 500,
        })
        for await (const chunk of chunks) {
          const delta = chunk.choices[0]?.delta?.content ?? ''
          if (delta.length > 0) {
            if (firstTokenAt === 0) {
              firstTokenAt = performance.now()
              self.postMessage({
                type: 'first-token',
                ms: Math.round(firstTokenAt - startedAt),
              })
            }
            tokens += 1
            content += delta
            self.postMessage({ type: 'token', delta, content })
          }
        }
        const elapsed = performance.now() - startedAt
        self.postMessage({
          type: 'generated',
          content,
          stats: {
            firstTokenMs: Math.round(firstTokenAt - startedAt),
            tokens,
            tokensPerSecond:
              tokens > 0
                ? Math.round((tokens / (elapsed / 1000)) * 10) / 10
                : 0,
          },
        })
        generating = false
        break
      }
      case 'reset': {
        if (engine) {
          await engine.resetChat()
          self.postMessage({ type: 'reset-ok' })
        }
        break
      }
      default: {
        const exhaustive: never = data
        void exhaustive
      }
    }
  } catch (error) {
    generating = false
    self.postMessage({
      type: 'error',
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
