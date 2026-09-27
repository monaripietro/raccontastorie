type SpeechRecognitionAlternativeLike = {
  transcript: string
}

type SpeechRecognitionResultLike = {
  0: SpeechRecognitionAlternativeLike
  isFinal: boolean
  length: number
}

type SpeechRecognitionEventLike = {
  resultIndex: number
  results: { length: number; [index: number]: SpeechRecognitionResultLike }
}

type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike

function getRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as Record<string, unknown>
  const ctor = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as
    | SpeechRecognitionConstructor
    | undefined
  return ctor ?? null
}

type StartOptions = {
  onFinalResult: (transcript: string) => void
  onError?: (error: string) => void
}

class SpeechRecognizer {
  private recognition: SpeechRecognitionLike | null = null
  private active = false
  private stopped = false
  private finalTranscript = ''

  get isSupported(): boolean {
    return getRecognitionConstructor() !== null
  }

  get isActive(): boolean {
    return this.active
  }

  start({ onFinalResult, onError }: StartOptions): boolean {
    const Ctor = getRecognitionConstructor()
    if (!Ctor || this.active) return false
    const recognition = new Ctor()
    recognition.lang = 'it-IT'
    recognition.continuous = false
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    this.recognition = recognition
    this.active = true
    this.stopped = false
    this.finalTranscript = ''
    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          this.finalTranscript += result[0].transcript
        }
      }
    }
    recognition.onerror = (event) => {
      onError?.(event.error)
    }
    recognition.onend = () => {
      this.active = false
      this.recognition = null
      if (!this.stopped) onFinalResult(this.finalTranscript.trim())
    }
    try {
      recognition.start()
      return true
    } catch {
      this.active = false
      this.recognition = null
      return false
    }
  }

  stop(): void {
    if (!this.recognition || !this.active) return
    this.stopped = true
    this.recognition.stop()
  }

  abort(): void {
    if (!this.recognition || !this.active) return
    this.stopped = true
    this.recognition.abort()
    this.active = false
    this.recognition = null
  }
}

export const speechRecognizer = new SpeechRecognizer()
