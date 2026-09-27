import { useCallback, useEffect, useRef, useState } from 'react'
import AgeSelector from './components/AgeSelector'
import AudioOrb, { type OrbState } from './components/AudioOrb'
import ChoiceButtons from './components/ChoiceButtons'
import ModelOnboarding from './components/ModelOnboarding'
import { useVoiceShortcut } from './hooks/useVoiceShortcut'
import { llmEngine, type LlmStatus } from './services/llmEngine'
import { DEFAULT_MODEL_ID } from './services/modelConfig'
import {
  matchTranscriptToOptions,
  parseStoryBeat,
  StoryEngine,
} from './services/storyEngine'
import { speechRecognizer } from './services/speechRecognizer'
import { speechSynthesizer } from './services/speechSynthesizer'
import type { AgeGroup, StoryBeat, StoryOption } from './types/story'

type Screen = 'onboarding' | 'age-selection' | 'story' | 'ended'

const WELCOME_MESSAGE =
  'Ora ti racconto una storia e poi ti farò una domanda. Non devi toccare nulla: quando vedi l’anello verde ti sto ascoltando, e quando finisci di parlare io continuo la storia.'

const FALLBACK_MESSAGE_1 =
  'Non ti ho sentito bene. Parla quando vedi l’anello verde, e dimmi cosa scegli.'
const FALLBACK_MESSAGE_2 =
  'Puoi anche toccare uno dei pulsanti sullo schermo. Cosa preferisci?'
const FIRST_TOKEN_TIMEOUT_MS = 60000

const GENERIC_ERROR_MESSAGE =
  'Scusa, mi sono distratto un attimo. Ripetimi cosa vuoi fare.'

const STT_UNAVAILABLE_MESSAGE =
  'Questo browser non riesce ad ascoltare la voce. Puoi comunque giocare: tocca una delle scelte sullo schermo!'

export default function App() {
  const [screen, setScreen] = useState<Screen>('onboarding')
  const [llmStatus, setLlmStatus] = useState<LlmStatus>({ phase: 'idle' })
  const [orbState, setOrbState] = useState<OrbState>('idle')
  const [currentBeat, setCurrentBeat] = useState<StoryBeat | null>(null)
  const [lastTranscript, setLastTranscript] = useState('')
  const [sttSupported, setSttSupported] = useState(() => speechRecognizer.isSupported)

  const storyEngineRef = useRef<StoryEngine | null>(null)
  const fallbackAttemptsRef = useRef(0)
  const pausedRef = useRef(false)
  const listeningRef = useRef(false)
  const screenRef = useRef<Screen>('onboarding')
  const recoveryRef = useRef(false)
  const modelIdRef = useRef(DEFAULT_MODEL_ID)

  useEffect(() => {
    screenRef.current = screen
  }, [screen])

  useEffect(() => {
    speechSynthesizer.init()
    return () => {
      speechSynthesizer.cancel()
      speechRecognizer.abort()
      llmEngine.destroyWorker()
    }
  }, [])

  const startListening = useCallback(
    (onFinal: (transcript: string) => void) => {
      if (listeningRef.current || pausedRef.current) return
      if (!sttSupported) return
      listeningRef.current = true
      setLastTranscript('')
      const started = speechRecognizer.start({
        onFinalResult: (transcript) => {
          listeningRef.current = false
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
        silenceMs: 1800,
      })
      if (started) {
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
    ) => {
      speechRecognizer.abort()
      listeningRef.current = false
      pausedRef.current = false
      setOrbState('speaking')
      speechSynthesizer.speakSafely(text, {
        onEnd: () => {
          onDone?.()
          if (!pausedRef.current) {
            window.setTimeout(() => {
              if (!pausedRef.current) startListening(onTranscript)
            }, 400)
          }
        },
      })
    },
    [startListening],
  )

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
    const { option } = matchTranscriptToOptions(transcript, beat.options)
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
        'Il telefonino è un po’ stanco per raccontare adesso. Riprova tra poco, oppure scegli con i pulsanti sullo schermo.',
        handleVoiceInput,
      )
      return
    }
    recoveryRef.current = true
    llmEngine.destroyWorker()
    llmEngine.load((status) => {
      if (status.phase === 'ready') {
        void generateStep(retry)
      }
      if (status.phase === 'error') {
        speakThenListen(GENERIC_ERROR_MESSAGE, handleVoiceInput)
      }
    }, modelIdRef.current)
  }

  async function generateStep(retry = false) {
    const engine = storyEngineRef.current
    if (!engine) return
    setOrbState('loading')
    const { messages } = retry
      ? engine.retryMessages()
      : engine.nextStepMessages()
    let firstTokenSeen = false
    const watchdog = window.setTimeout(() => {
      if (!firstTokenSeen && llmEngine.isGenerating) {
        llmEngine.destroyWorker()
        recoveryRef.current = true
        setLlmStatus({ phase: 'idle' })
        recoverAfterStall(retry)
      }
    }, FIRST_TOKEN_TIMEOUT_MS)
    try {
      const raw = await llmEngine.generate(messages, {
        onFirstToken: () => {
          firstTokenSeen = true
          window.clearTimeout(watchdog)
        },
      })
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

  const startModelLoad = useCallback((modelId: string) => {
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

  const handleAgeSelection = useCallback((group: AgeGroup) => {
    const engine = new StoryEngine(group, 'una storia magica')
    storyEngineRef.current = engine
    fallbackAttemptsRef.current = 0
    setScreen('story')
    speechSynthesizer.speakSafely(WELCOME_MESSAGE, {
      onEnd: () => {
        void generateStep()
      },
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleToggle = useCallback(() => {
    if (screenRef.current !== 'story') return
    if (speechRecognizer.isActive) {
      pausedRef.current = true
      speechRecognizer.abort()
      listeningRef.current = false
      setOrbState('idle')
      return
    }
    pausedRef.current = false
    startListening(handleVoiceInput)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startListening])

  useVoiceShortcut({
    enabled: screen === 'story',
    onToggle: handleToggle,
  })

  const handleChoiceButton = useCallback((option: StoryOption) => {
    const engine = storyEngineRef.current
    if (!engine || screenRef.current !== 'story') return
    speechRecognizer.abort()
    listeningRef.current = false
    pausedRef.current = false
    setLastTranscript(option.label)
    advanceWithChoice(option, option.label)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleRestart = useCallback(() => {
    storyEngineRef.current = null
    setCurrentBeat(null)
    setLastTranscript('')
    fallbackAttemptsRef.current = 0
    pausedRef.current = false
    listeningRef.current = false
    setOrbState('idle')
    setScreen('age-selection')
  }, [])

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-slate-950 px-4 py-8 text-slate-100 sm:gap-8 sm:px-6 sm:py-12">
      <header className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">Raccontastorie</h1>
        <p className="mt-2 text-sm text-slate-400">
          Il tuo narratore interattivo a bivi
        </p>
      </header>

      {screen === 'onboarding' && (
        <ModelOnboarding status={llmStatus} onStart={startModelLoad} />
      )}

      {screen === 'age-selection' && (
        <AgeSelector onSelect={handleAgeSelection} />
      )}

      {(screen === 'story' || screen === 'ended') && (
        <>
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
              disabled={!sttSupported ? false : orbState === 'speaking' || orbState === 'loading'}
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
