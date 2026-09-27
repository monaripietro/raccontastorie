export type SpeakOptions = {
  onEnd?: () => void
  onStart?: () => void
}

type QueueItem = {
  text: string
  options: SpeakOptions
}

const PREFERRED_VOICES = ['google italiano', 'italiana', 'italiano']

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
    for (const preferred of PREFERRED_VOICES) {
      const match = voices.find(
        (v) => v.lang.toLowerCase().startsWith('it') && v.name.toLowerCase().includes(preferred),
      )
      if (match) return match
    }
    return voices.find((v) => v.lang.toLowerCase().startsWith('it')) ?? null
  }

  private ensureVoice(): SpeechSynthesisVoice | null {
    if (!this.voicesReady) {
      this.italianVoice = this.pickItalianVoice()
      this.voicesReady = true
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
    utterance.pitch = 1.05
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
