export type SpeakOptions = {
  onEnd?: () => void
  onStart?: () => void
}

type QueueItem = {
  text: string
  options: SpeakOptions
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
    this.queue.push({ text, options })
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

  private playNext(): void {
    const item = this.queue.shift()
    if (!item) {
      this.speaking = false
      return
    }
    this.speaking = true
    const utterance = new SpeechSynthesisUtterance(item.text)
    utterance.lang = 'it-IT'
    utterance.rate = 0.95
    utterance.pitch = 1
    const voice = this.ensureVoice()
    if (voice) utterance.voice = voice
    utterance.onstart = () => item.options.onStart?.()
    utterance.onend = () => {
      item.options.onEnd?.()
      if (this.queue.length > 0) {
        this.playNext()
      } else {
        this.speaking = false
      }
    }
    utterance.onerror = () => {
      item.options.onEnd?.()
      if (this.queue.length > 0) {
        this.playNext()
      } else {
        this.speaking = false
      }
    }
    window.speechSynthesis.speak(utterance)
  }

  cancel(): void {
    if (!this.isSupported) return
    this.queue = []
    this.speaking = false
    window.speechSynthesis.cancel()
  }
}

export const speechSynthesizer = new SpeechSynthesizer()
