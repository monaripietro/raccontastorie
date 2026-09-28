type SpeechRecognitionAlternativeLike = {
  transcript: string
}

type SpeechRecognitionResultLike = {
  isFinal: boolean
  length: number
  [index: number]: SpeechRecognitionAlternativeLike
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
  onPartial?: (transcript: string) => void
  onError?: (error: string) => void
  handsFree?: boolean
  silenceMs?: number
  noSpeechTimeoutMs?: number
}

const DEFAULT_SILENCE_MS = 1800
const DEFAULT_NO_SPEECH_TIMEOUT_MS = 12000

class SpeechRecognizer {
  private recognition: SpeechRecognitionLike | null = null
  private active = false
  private finalTranscript = ''
  private partialTranscript = ''
  private deliverOnEnd = true
  private endHandler: ((transcript: string) => void) | null = null
  private silenceTimer: number | null = null
  private noSpeechTimer: number | null = null
  private lastSpeechAt = 0
  private silenceMs = DEFAULT_SILENCE_MS

  get isSupported(): boolean {
    return getRecognitionConstructor() !== null
  }

  get isActive(): boolean {
    return this.active
  }

  private clearSilenceTimer(): void {
    if (this.silenceTimer !== null) {
      window.clearTimeout(this.silenceTimer)
      this.silenceTimer = null
    }
    if (this.noSpeechTimer !== null) {
      window.clearTimeout(this.noSpeechTimer)
      this.noSpeechTimer = null
    }
  }

  private scheduleSilenceEnd(): void {
    this.clearSilenceTimer()
    const wait = Math.max(
      this.silenceMs - (Date.now() - this.lastSpeechAt),
      200,
    )
    this.silenceTimer = window.setTimeout(() => {
      if (!this.active) return
      const hadSpeech =
        this.finalTranscript.length > 0 || this.partialTranscript.length > 0
      if (!hadSpeech) return
      this.stop()
    }, wait)
  }

  start({
    onFinalResult,
    onPartial,
    onError,
    handsFree = false,
    silenceMs = DEFAULT_SILENCE_MS,
    noSpeechTimeoutMs = DEFAULT_NO_SPEECH_TIMEOUT_MS,
  }: StartOptions): boolean {
    const Ctor = getRecognitionConstructor()
    if (!Ctor || this.active) return false
    const recognition = new Ctor()
    recognition.lang = 'it-IT'
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 1
    this.recognition = recognition
    this.active = true
    this.deliverOnEnd = true
    this.finalTranscript = ''
    this.partialTranscript = ''
    this.silenceMs = silenceMs
    this.lastSpeechAt = Date.now()
    this.endHandler = onFinalResult
    recognition.onresult = (event) => {
      let interim = ''
      let speechNow = false
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const transcript = result[0]?.transcript ?? ''
        if (result.isFinal) {
          this.finalTranscript += transcript
          speechNow = true
        } else {
          interim += transcript
        }
      }
      if (interim.length > 0) {
        this.partialTranscript = interim
        speechNow = true
        onPartial?.(interim.trim())
      }
      if (speechNow) {
        this.lastSpeechAt = Date.now()
        if (this.noSpeechTimer !== null) {
          window.clearTimeout(this.noSpeechTimer)
          this.noSpeechTimer = null
        }
        if (handsFree) {
          if (event.results[event.results.length - 1]?.isFinal) {
            this.stop()
          } else {
            this.scheduleSilenceEnd()
          }
        }
      }
    }
    recognition.onerror = (event) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return
      const fatal =
        event.error === 'network' ||
        event.error === 'service-not-allowed' ||
        event.error === 'not-allowed'
      if (fatal) {
        this.deliverOnEnd = false
        this.endHandler = null
        this.active = false
        this.recognition = null
        this.clearSilenceTimer()
      }
      onError?.(event.error)
    }
    recognition.onend = () => {
      this.clearSilenceTimer()
      this.active = false
      this.recognition = null
      const handler = this.endHandler
      this.endHandler = null
      if (this.deliverOnEnd) {
        const transcript = (
          this.finalTranscript || this.partialTranscript
        ).trim()
        handler?.(transcript)
      }
    }
    try {
      recognition.start()
      if (handsFree) {
        this.noSpeechTimer = window.setTimeout(() => {
          if (!this.active) return
          this.stop()
        }, noSpeechTimeoutMs)
      }
      return true
    } catch {
      this.active = false
      this.recognition = null
      this.endHandler = null
      return false
    }
  }

  stop(): void {
    this.clearSilenceTimer()
    if (!this.recognition || !this.active) return
    this.deliverOnEnd = true
    try {
      this.recognition.stop()
    } catch {
      const handler = this.endHandler
      const transcript = (
        this.finalTranscript || this.partialTranscript
      ).trim()
      this.active = false
      this.recognition = null
      this.endHandler = null
      handler?.(transcript)
    }
  }

  abort(): void {
    this.clearSilenceTimer()
    this.deliverOnEnd = false
    this.endHandler = null
    if (this.recognition && this.active) {
      try {
        this.recognition.abort()
      } catch {
        this.active = false
        this.recognition = null
      }
    }
  }
}

export const speechRecognizer = new SpeechRecognizer()
