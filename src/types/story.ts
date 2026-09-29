export type AgeGroup = '3-5' | '6-9' | '10+'

export type HeroChapter = {
  index: number
  title: string
  guidance: string
}

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type AgeStyle = {
  group: AgeGroup
  label: string
  styleGuide: string
}

export type EngineKind = 'webgpu' | 'openrouter'

export type LlmStatus =
  | { phase: 'idle' }
  | { phase: 'loading'; progress: number; text: string }
  | { phase: 'ready' }
  | { phase: 'error'; error: string }
