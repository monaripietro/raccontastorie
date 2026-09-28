export type SpeakOptions = {
  onEnd?: () => void
  onStart?: () => void
}

type QueueItem = {
  text: string
  options: SpeakOptions
}

const MAX_CHUNK_CHARS = 200

function chunkText(text: string): string[] {
  const sentences = text.match(/[^.!?…]+[.!?…]*\s*/g) ?? [text]
  const chunks: string[] = []
  let current = ''
  for (const sentence of sentences) {
    if ((current + sentence).trim().length > MAX_CHUNK_CHARS && current.trim().length > 0) {
      chunks.push(current.trim())
      current = sentence
    } else {
      current += sentence
    }
  }
  if (current.trim().length > 0) chunks.push(current.trim())
  return chunks.length > 0 ? chunks : [text]
}

type VoiceLike = { name: string; lang: string }

export function scoreItalianVoice(voice: VoiceLike): number {
  const name = voice.name.toLowerCase()
  const lang = voice.lang.toLowerCase()
  if (!lang.startsWith('it')) return -1
  let score = 0
  if (name.includes('natural')) score += 100
  if (name.includes('google italiano')) score += 80
  if (name.includes('premium') || name.includes('enhanced')) score += 60
  if (name.includes('online')) score += 40
  if (name.includes('siri')) score += 20
  if (lang.startsWith('it-it')) score += 10
  return score
}

class SpeechSynthesizer {
  private queue: QueueItem[] = []
  private speaking = false
  private italianVoice: SpeechSynthesisVoice | null = null
  private voicesReady = false
  private keepAliveTimer: number | null = null

  get isSupported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window
  }

  get isSpeaking(): boolean {
    return this.speaking
  }

  private pickItalianVoice(): SpeechSynthesisVoice | null {
    const voices = window.speechSynthesis.getVoices()
    if (voices.length === 0) return null
    let best: SpeechSynthesisVoice | null = null
    let bestScore = -1
    for (const voice of voices) {
      const score = scoreItalianVoice(voice)
      if (score > bestScore) {
        best = voice
        bestScore = score
      }
    }
    return best
  }

  private ensureVoice(): SpeechSynthesisVoice | null {
    if (!this.voicesReady) {
      const voice = this.pickItalianVoice()
      if (voice) {
        this.italianVoice = voice
        this.voicesReady = true
      }
    }
    return this.italianVoice
  }

  init(): void {
    if (!this.isSupported) return
    window.speechSynthesis.onvoiceschanged = () => {
      this.italianVoice = this.pickItalianVoice()
      this.voicesReady = true
    }
  }

  speak(text: string, options: SpeakOptions = {}): void {
    if (!this.isSupported || text.trim().length === 0) {
      options.onEnd?.()
      return
    }
    const chunks = chunkText(text)
    chunks.forEach((chunk, index) => {
      const chunkOptions: SpeakOptions = {}
      if (index === 0 && options.onStart) chunkOptions.onStart = options.onStart
      if (index === chunks.length - 1 && options.onEnd) {
        chunkOptions.onEnd = options.onEnd
      }
      this.queue.push({ text: chunk, options: chunkOptions })
    })
    if (!this.speaking) {
      this.playNext()
    }
  }

  speakSafely(text: string, options: SpeakOptions = {}): void {
    try {
      this.speak(text, options)
    } catch {
      options.onEnd?.()
    }
  }

  private startKeepAlive(): void {
    if (this.keepAliveTimer !== null) return
    this.keepAliveTimer = window.setInterval(() => {
      try {
        window.speechSynthesis.resume()
      } catch {
        /* noop */
      }
    }, 10000)
  }

  private stopKeepAlive(): void {
    if (this.keepAliveTimer !== null) {
      window.clearInterval(this.keepAliveTimer)
      this.keepAliveTimer = null
    }
  }

  private playNext(): void {
    const item = this.queue.shift()
    if (!item) {
      this.speaking = false
      this.stopKeepAlive()
      return
    }
    this.speaking = true
    this.startKeepAlive()
    const utterance = new SpeechSynthesisUtterance(item.text)
    utterance.lang = 'it-IT'
    utterance.rate = 0.95
    utterance.pitch = 1
    const voice = this.ensureVoice()
    if (voice) utterance.voice = voice
    utterance.onstart = () => item.options.onStart?.()
    let settled = false
    const finish = () => {
      if (settled) return
      settled = true
      item.options.onEnd?.()
      if (this.queue.length > 0) {
        this.playNext()
      } else {
        this.speaking = false
        this.stopKeepAlive()
      }
    }
    utterance.onend = finish
    utterance.onerror = finish
    window.speechSynthesis.speak(utterance)
  }

  cancel(): void {
    if (!this.isSupported) return
    this.queue = []
    this.speaking = false
    this.stopKeepAlive()
    window.speechSynthesis.cancel()
  }
}

export const speechSynthesizer = new SpeechSynthesizer()
