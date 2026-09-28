import { useCallback, useEffect, useRef, useState } from 'react'
import AgeSelector from './components/AgeSelector'
import AudioOrb, { type OrbState } from './components/AudioOrb'
import ChoiceButtons from './components/ChoiceButtons'
import ModelOnboarding from './components/ModelOnboarding'
import { useVoiceShortcut } from './hooks/useVoiceShortcut'
import { llmEngine, type ChatMessage, type LlmStatus } from './services/llmEngine'
import { playListenCue } from './services/audioCues'
import { OpenRouterEngine } from './services/openRouterEngine'
import {
  isMeaningfulTranscript,
  matchTranscriptToOptions,
  parseStoryBeat,
  parseTitle,
  StoryEngine,
} from './services/storyEngine'
import { speechRecognizer } from './services/speechRecognizer'
import { speechSynthesizer } from './services/speechSynthesizer'
import type { AgeGroup, StoryBeat, StoryOption } from './types/story'

type Screen =
  | 'onboarding'
  | 'age-selection'
  | 'theme'
  | 'title'
  | 'story'
  | 'ended'

type EngineKind = 'webgpu' | 'openrouter'

const WELCOME_MESSAGE =
  'Ora ti racconto una storia e poi ti farò una domanda. Non devi toccare nulla: quando vedi l\u2019anello verde ti sto ascoltando, e quando finisci di parlare io continuo la storia.'

const THEME_PROMPT =
  'Ciao, io sono Raccontastorie! Dimmi: su cosa vorresti che ti raccontassi una storia? Puoi dirmi qualsiasi cosa, per esempio dinosauri, principesse, spazio... oppure dirmi scegli tu!'

const TITLE_ANNOUNCEMENT = (title: string) =>
  `Che bello! La storia si intitola: ${title}. Spegni la luce, e ascolta...`

const FALLBACK_MESSAGE_1 =
  'Non ti ho sentito bene. Parla quando vedi l\u2019anello verde, e dimmi cosa scegli.'
const FALLBACK_MESSAGE_2 =
  'Puoi anche toccare uno dei pulsanti sullo schermo. Cosa preferisci?'

const GENERIC_ERROR_MESSAGE =
  'Scusa, mi sono distratto un attimo. Ripetimi cosa vuoi fare.'

const STT_UNAVAILABLE_MESSAGE =
  'Questo browser non riesce ad ascoltare la voce. Puoi comunque giocare: tocca una delle scelte sullo schermo!'

const CONFIRM_PROMPT = (transcript: string) =>
  `Ho capito bene? Hai detto: ${transcript}. Dimmi sì per continuare, oppure dimmi cosa preferisci davvero.`

const FIRST_TOKEN_TIMEOUT_MS = 60000
const OPENROUTER_FIRST_TOKEN_TIMEOUT_MS = 45000

type pendingIntent = {
  kind: 'confirm-match'
  option: StoryOption
  transcript: string
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('onboarding')
  const [llmStatus, setLlmStatus] = useState<LlmStatus>({ phase: 'idle' })
  const [orbState, setOrbState] = useState<OrbState>('idle')
  const [currentBeat, setCurrentBeat] = useState<StoryBeat | null>(null)
  const [lastTranscript, setLastTranscript] = useState('')
  const [storyTitle, setStoryTitle] = useState('')
  const [sttSupported, setSttSupported] = useState(() =>
    speechRecognizer.isSupported,
  )

  const storyEngineRef = useRef<StoryEngine | null>(null)
  const fallbackAttemptsRef = useRef(0)
  const pausedRef = useRef(false)
  const listeningRef = useRef(false)
  const screenRef = useRef<Screen>('onboarding')
  const recoveryRef = useRef(false)
  const engineKindRef = useRef<EngineKind>('webgpu')
  const openRouterRef = useRef<OpenRouterEngine | null>(null)
  const pendingIntentRef = useRef<pendingIntent | null>(null)

  useEffect(() => {
    screenRef.current = screen
  }, [screen])

  useEffect(() => {
    speechSynthesizer.init()
    return () => {
      speechSynthesizer.cancel()
      speechRecognizer.abort()
      llmEngine.destroyWorker()
      openRouterRef.current?.cancel()
    }
  }, [])

  const startListening = useCallback(
    (
      onFinal: (transcript: string) => void,
      silenceMs = 2500,
    ) => {
      if (listeningRef.current || pausedRef.current) return
      if (!sttSupported) return
      listeningRef.current = true
      setLastTranscript('')
      const started = speechRecognizer.start({
        onFinalResult: (transcript) => {
          listeningRef.current = false
          playListenCue('listening-off')
          setOrbState('loading')
          onFinal(transcript)
        },
        onPartial: (transcript) => {
          if (transcript.length > 0) setLastTranscript(transcript)
        },
        onError: (error) => {
          listeningRef.current = false
          if (
            error === 'network' ||
            error === 'service-not-allowed' ||
            error === 'not-allowed'
          ) {
            setSttSupported(false)
            setOrbState('idle')
            if (screenRef.current === 'story') {
              speechSynthesizer.speakSafely(STT_UNAVAILABLE_MESSAGE)
            }
            return
          }
          setOrbState('idle')
        },
        handsFree: true,
        silenceMs,
      })
      if (started) {
        playListenCue('listening-on')
        setOrbState('listening')
      } else {
        listeningRef.current = false
      }
    },
    [sttSupported],
  )

  const speakThenListen = useCallback(
    (
      text: string,
      onTranscript: (transcript: string) => void,
      onDone?: () => void,
      opts?: { listenAfter?: boolean; silenceMs?: number },
    ) => {
      speechRecognizer.abort()
      listeningRef.current = false
      pausedRef.current = false
      setOrbState('speaking')
      const listenAfter = opts?.listenAfter !== false
      speechSynthesizer.speakSafely(text, {
        onEnd: () => {
          onDone?.()
          if (!listenAfter) return
          if (!pausedRef.current && sttSupported) {
            window.setTimeout(() => {
              if (!pausedRef.current && !listeningRef.current) {
                startListening(onTranscript, opts?.silenceMs)
              }
            }, 700)
          } else if (!sttSupported) {
            setOrbState('idle')
          }
        },
      })
    },
    [startListening, sttSupported],
  )

  async function generateText(
    messages: ChatMessage[],
    callbacks?: {
      onFirstToken?: () => void
      onToken?: (content: string) => void
    },
  ): Promise<string> {
    if (engineKindRef.current === 'openrouter' && openRouterRef.current) {
      return openRouterRef.current.generate(messages, {
        onFirstToken: callbacks?.onFirstToken,
        onToken: callbacks?.onToken,
      })
    }
    return llmEngine.generate(messages, callbacks)
  }

  function handleVoiceInput(transcript: string) {
    const engine = storyEngineRef.current
    if (!engine || screenRef.current !== 'story') {
      setOrbState('idle')
      return
    }
    setLastTranscript(transcript)
    const beat = engine.beat
    if (!beat) {
      setOrbState('idle')
      return
    }

    const confirmTarget = pendingIntentRef.current
    if (confirmTarget && confirmTarget.kind === 'confirm-match') {
      const normalized = transcript.toLowerCase().trim()
      if (normalized.startsWith('sì') || normalized.startsWith('si ') || normalized === 'si') {
        pendingIntentRef.current = null
        engine.registerChoice(confirmTarget.option.label, confirmTarget.transcript)
        fallbackAttemptsRef.current = 0
        setCurrentBeat(null)
        void generateStep()
        return
      }
      pendingIntentRef.current = null
      const { option } = matchTranscriptToOptions(transcript, beat.options)
      if (option) {
        engine.registerChoice(option.label, transcript)
        fallbackAttemptsRef.current = 0
        setCurrentBeat(null)
        void generateStep()
        return
      }
      advanceWithChoice(null, transcript)
      return
    }

    const mode = engine.profile.choiceMode
    const { option, confidence } = matchTranscriptToOptions(
      transcript,
      beat.options,
    )

    if (mode === 'open') {
      if (isMeaningfulTranscript(transcript)) {
        engine.registerChoice(transcript, transcript)
        fallbackAttemptsRef.current = 0
        setCurrentBeat(null)
        void generateStep()
      } else {
        advanceWithChoice(null, transcript)
      }
      return
    }

    if (mode === 'hybrid' && !option && isMeaningfulTranscript(transcript)) {
      engine.registerChoice(transcript, transcript)
      fallbackAttemptsRef.current = 0
      setCurrentBeat(null)
      void generateStep()
      return
    }

    if (option && confidence === 'low' && isMeaningfulTranscript(transcript)) {
      pendingIntentRef.current = {
        kind: 'confirm-match',
        option,
        transcript,
      }
      speakThenListen(CONFIRM_PROMPT(transcript), handleVoiceInput)
      return
    }

    advanceWithChoice(option, transcript)
  }

  function advanceWithChoice(
    option: StoryOption | null,
    transcript: string,
  ) {
    const engine = storyEngineRef.current
    if (!engine) return
    if (!sttSupported && !option) return
    if (option) {
      engine.registerChoice(option.label, transcript)
      fallbackAttemptsRef.current = 0
      setCurrentBeat(null)
      void generateStep()
      return
    }
    fallbackAttemptsRef.current += 1
    const beat = engine.beat
    if (fallbackAttemptsRef.current >= 2 && beat && beat.options.length > 0) {
      speakThenListen(FALLBACK_MESSAGE_2, handleVoiceInput)
      return
    }
    speakThenListen(FALLBACK_MESSAGE_1, handleVoiceInput)
  }

  function recoverAfterStall(retry: boolean) {
    if (recoveryRef.current) {
      speakThenListen(
        'Il telefonino è un po\u2019 stanco per raccontare adesso. Riprova tra poco, oppure scegli con i pulsanti sullo schermo.',
        handleVoiceInput,
      )
      return
    }
    recoveryRef.current = true
    llmEngine.destroyWorker()
    llmEngine.load(
      (status) => {
        if (status.phase === 'ready') {
          void generateStep(retry)
        }
        if (status.phase === 'error') {
          speakThenListen(GENERIC_ERROR_MESSAGE, handleVoiceInput)
        }
      },
      engineKindRef.current === 'webgpu' ? modelIdRef.current : undefined,
    )
  }

  const modelIdRef = useRef('')

  async function generateStep(retry = false) {
    const engine = storyEngineRef.current
    if (!engine) return
    setOrbState('loading')
    const { messages } = retry
      ? engine.retryMessages()
      : engine.nextStepMessages()
    const timeoutMs =
      engineKindRef.current === 'openrouter'
        ? OPENROUTER_FIRST_TOKEN_TIMEOUT_MS
        : FIRST_TOKEN_TIMEOUT_MS
    let firstTokenSeen = false
    const watchdog = window.setTimeout(() => {
      const busy =
        engineKindRef.current === 'openrouter'
          ? openRouterRef.current?.isGenerating
          : llmEngine.isGenerating
      if (!firstTokenSeen && busy) {
        if (engineKindRef.current === 'openrouter') {
          openRouterRef.current?.cancel()
          speakThenListen(GENERIC_ERROR_MESSAGE, handleVoiceInput)
          return
        }
        llmEngine.destroyWorker()
        recoveryRef.current = true
        setLlmStatus({ phase: 'idle' })
        recoverAfterStall(retry)
      }
    }, timeoutMs)
    try {
      const raw = await generateText(messages)
      window.clearTimeout(watchdog)
      const parsed = parseStoryBeat(raw, engine.isFinalStep)
      if (!parsed.ok) {
        speakThenListen(GENERIC_ERROR_MESSAGE, handleVoiceInput)
        return
      }
      engine.setBeat(parsed.beat)
      setCurrentBeat(parsed.beat)
      const isEnd = parsed.beat.isStoryEnd || engine.isFinalStep
      const text = isEnd
        ? parsed.beat.narration
        : `${parsed.beat.narration} ${parsed.beat.choicePrompt}`
      speakThenListen(text, handleVoiceInput, () => {
        if (isEnd) setScreen('ended')
      })
    } catch {
      window.clearTimeout(watchdog)
      speakThenListen(GENERIC_ERROR_MESSAGE, handleVoiceInput)
    }
  }

  function handleThemeInput(transcript: string) {
    const engine = storyEngineRef.current
    if (!engine) {
      setOrbState('idle')
      return
    }
    if (!isMeaningfulTranscript(transcript) && transcript.trim().length < 3) {
      speakThenListen(
        'Ti ascolto! Dimmi pure: di cosa vuoi la storia?',
        handleThemeInput,
        undefined,
        { silenceMs: 4500 },
      )
      return
    }
    const normalized = transcript.toLowerCase().trim()
    const wantsAuto =
      normalized === 'scegli tu' ||
      normalized === 'scegli' ||
      normalized.includes('decidi tu') ||
      normalized.includes('fai tu')
    engine.setTheme(wantsAuto ? '' : transcript.trim())
    setOrbState('loading')
    void generateTitle()
  }

  async function generateTitle() {
    const engine = storyEngineRef.current
    if (!engine) return
    const messages = engine.titleMessages()
    const timeoutMs =
      engineKindRef.current === 'openrouter'
        ? OPENROUTER_FIRST_TOKEN_TIMEOUT_MS
        : FIRST_TOKEN_TIMEOUT_MS
    let firstTokenSeen = false
    const watchdog = window.setTimeout(() => {
      const busy =
        engineKindRef.current === 'openrouter'
          ? openRouterRef.current?.isGenerating
          : llmEngine.isGenerating
      if (firstTokenSeen || !busy) return
      if (engineKindRef.current === 'openrouter') {
        openRouterRef.current?.cancel()
        speakThenListen(GENERIC_ERROR_MESSAGE, () => handleThemeInput(''))
        return
      }
      llmEngine.destroyWorker()
      recoveryRef.current = true
      setLlmStatus({ phase: 'idle' })
      llmEngine.load(
        (status) => {
          if (status.phase === 'ready') {
            void generateTitle()
          }
          if (status.phase === 'error') {
            speakThenListen(GENERIC_ERROR_MESSAGE, () => handleThemeInput(''))
          }
        },
        modelIdRef.current,
      )
    }, timeoutMs)
    try {
      const raw = await generateText(messages, {
        onFirstToken: () => {
          firstTokenSeen = true
          window.clearTimeout(watchdog)
        },
      })
      window.clearTimeout(watchdog)
      const parsed = parseTitle(raw)
      if (!parsed.ok) {
        speakThenListen(GENERIC_ERROR_MESSAGE, () => handleThemeInput(''))
        return
      }
      engine.setTitle(parsed.title)
      setStoryTitle(parsed.title)
      setScreen('story')
      speakThenListen(
        `${TITLE_ANNOUNCEMENT(parsed.title)} ${WELCOME_MESSAGE}`,
        handleVoiceInput,
        () => {
          void generateStep()
        },
        { listenAfter: false },
      )
    } catch {
      window.clearTimeout(watchdog)
      speakThenListen(GENERIC_ERROR_MESSAGE, () => handleThemeInput(''))
    }
  }

  const startModelLoad = useCallback((modelId: string) => {
    engineKindRef.current = 'webgpu'
    modelIdRef.current = modelId
    recoveryRef.current = false
    setLlmStatus({ phase: 'loading', progress: 0, text: '' })
    llmEngine.load(
      (status) => {
        setLlmStatus(status)
        if (status.phase === 'ready') {
          setScreen('age-selection')
        }
      },
      modelId,
    )
  }, [])

  const startOpenRouter = useCallback((apiKey: string) => {
    engineKindRef.current = 'openrouter'
    openRouterRef.current = new OpenRouterEngine({ apiKey })
    setLlmStatus({ phase: 'ready' })
    setScreen('age-selection')
  }, [])

  const handleAgeSelection = useCallback((group: AgeGroup) => {
    const engine = new StoryEngine(group, '')
    storyEngineRef.current = engine
    fallbackAttemptsRef.current = 0
    setScreen('theme')
    speakThenListen(THEME_PROMPT, handleThemeInput, undefined, {
      silenceMs: 4500,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speakThenListen])

  const handleThemeButton = useCallback((theme: string) => {
    speechRecognizer.abort()
    listeningRef.current = false
    handleThemeInput(theme)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleToggle = useCallback(() => {
    if (screenRef.current !== 'story' && screenRef.current !== 'theme') return
    if (speechRecognizer.isActive) {
      pausedRef.current = true
      speechRecognizer.abort()
      listeningRef.current = false
      playListenCue('listening-off')
      setOrbState('idle')
      return
    }
    pausedRef.current = false
    if (screenRef.current === 'theme') {
      startListening(handleThemeInput)
    } else {
      startListening(handleVoiceInput)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startListening])

  useVoiceShortcut({
    enabled: screen === 'story' || screen === 'theme',
    onToggle: handleToggle,
  })

  const handleChoiceButton = useCallback((option: StoryOption) => {
    const engine = storyEngineRef.current
    if (!engine || screenRef.current !== 'story') return
    speechRecognizer.abort()
    listeningRef.current = false
    pausedRef.current = false
    pendingIntentRef.current = null
    setLastTranscript(option.label)
    advanceWithChoice(option, option.label)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleRestart = useCallback(() => {
    speechSynthesizer.cancel()
    speechRecognizer.abort()
    openRouterRef.current?.cancel()
    storyEngineRef.current = null
    setCurrentBeat(null)
    setLastTranscript('')
    setStoryTitle('')
    fallbackAttemptsRef.current = 0
    pendingIntentRef.current = null
    pausedRef.current = false
    listeningRef.current = false
    setOrbState('idle')
    setScreen('age-selection')
  }, [])

  const quickThemes = ['dinosauri', 'principesse', 'spazio', 'scegli tu']

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-slate-950 px-4 py-8 text-slate-100 sm:gap-8 sm:px-6 sm:py-12">
      <header className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">Raccontastorie</h1>
        <p className="mt-2 text-sm text-slate-400">
          Il tuo narratore interattivo a bivi
        </p>
      </header>

      {screen === 'onboarding' && (
        <ModelOnboarding
          status={llmStatus}
          onStart={startModelLoad}
          onOpenRouterStart={startOpenRouter}
        />
      )}

      {screen === 'age-selection' && (
        <AgeSelector onSelect={handleAgeSelection} />
      )}

      {screen === 'theme' && (
        <div className="flex max-w-xl flex-col items-center gap-6 text-center">
          <AudioOrb
            state={orbState}
            onToggle={handleToggle}
            disabled={false}
          />
          <p className="max-w-md text-lg text-slate-200" aria-live="polite">
            Su cosa vorresti che ti raccontassi una storia?
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {quickThemes.map((theme) => (
              <button
                key={theme}
                type="button"
                onClick={() => handleThemeButton(theme)}
                className="rounded-full border border-slate-600 bg-slate-800/80 px-5 py-2 text-sm text-slate-100 transition hover:border-emerald-400/60 hover:bg-slate-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300/40 active:scale-[0.98]"
              >
                {theme}
              </button>
            ))}
          </div>
        </div>
      )}

      {(screen === 'story' || screen === 'ended') && (
        <>
          {storyTitle.length > 0 && (
            <p className="max-w-md text-center text-lg font-semibold text-indigo-300">
              «{storyTitle}»
            </p>
          )}
          {!sttSupported && (
            <p
              className="max-w-md rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-center text-sm text-amber-200"
              role="alert"
            >
              Questo browser non supporta il riconoscimento vocale. Puoi
              comunque giocare toccando i pulsanti delle scelte.
            </p>
          )}
          <AudioOrb
            state={orbState}
            onToggle={handleToggle}
            disabled={screen === 'ended'}
          />
          {currentBeat && !currentBeat.isStoryEnd && (
            <ChoiceButtons
              options={currentBeat.options}
              onChoose={handleChoiceButton}
              disabled={
                !sttSupported
                  ? false
                  : orbState === 'speaking' || orbState === 'loading'
              }
            />
          )}
          {lastTranscript.length > 0 && (
            <p
              className="max-w-md text-center text-base text-slate-300"
              aria-live="polite"
            >
              «{lastTranscript}»
            </p>
          )}
          {screen === 'story' && (
            <button
              type="button"
              onClick={handleRestart}
              className="rounded-full border border-slate-600 bg-slate-900/60 px-6 py-2 text-sm text-slate-300 transition hover:border-indigo-400/60 hover:text-slate-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-300/50"
            >
              ✨ Nuova storia
            </button>
          )}
          {screen === 'ended' && (
            <div className="flex flex-col items-center gap-4 text-center">
              <p className="text-xl font-semibold text-emerald-300">
                La storia è finita! 🎉
              </p>
              <button
                type="button"
                onClick={handleRestart}
                className="rounded-full bg-indigo-500 px-8 py-3 font-semibold text-white transition hover:bg-indigo-400 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-300/50"
              >
                Raccontami un'altra storia
              </button>
            </div>
          )}
        </>
      )}

      <footer className="safe-bottom text-xs text-slate-600">
        Funziona interamente offline, nel tuo browser.
      </footer>
    </main>
  )
}
