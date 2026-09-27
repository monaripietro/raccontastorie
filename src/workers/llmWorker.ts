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
        const reply = await engine.chat.completions.create({
          messages: data.messages,
          stream: false,
          temperature: 0.7,
          max_tokens: 400,
        })
        const content = reply.choices[0]?.message?.content ?? ''
        self.postMessage({ type: 'generated', content })
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
    self.postMessage({
      type: 'error',
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
