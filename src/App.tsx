import { useCallback, useEffect, useRef, useState } from 'react'
import AgeSelector from './components/AgeSelector'
import AudioOrb, { type OrbState } from './components/AudioOrb'
import ChoiceButtons from './components/ChoiceButtons'
import ModelOnboarding from './components/ModelOnboarding'
import { usePushToTalk } from './hooks/usePushToTalk'
import { llmEngine, type LlmStatus } from './services/llmEngine'
import {
  matchTranscriptToOptions,
  parseStoryBeat,
  StoryEngine,
} from './services/storyEngine'
import { speechRecognizer } from './services/speechRecognizer'
import { speechSynthesizer } from './services/speechSynthesizer'
import type { AgeGroup, StoryBeat, StoryOption } from './types/story'

type Screen = 'onboarding' | 'age-selection' | 'story' | 'ended'

const FALLBACK_MESSAGE_1 =
  'Non sono riuscito a sentirti bene. Tieni premuta la barra spaziatrice e ripetimi cosa vuoi fare.'
const FALLBACK_MESSAGE_2 =
  'Puoi scegliere tra le opzioni che ti ho detto, oppure tocca uno dei pulsanti sullo schermo. Cosa preferisci?'
const GENERIC_ERROR_MESSAGE =
  'Scusa, mi sono distratto un attimo. Ripetimi cosa vuoi fare.'

export default function App() {
  const [screen, setScreen] = useState<Screen>('onboarding')
  const [llmStatus, setLlmStatus] = useState<LlmStatus>({ phase: 'idle' })
  const [orbState, setOrbState] = useState<OrbState>('idle')
  const [currentBeat, setCurrentBeat] = useState<StoryBeat | null>(null)
  const [lastTranscript, setLastTranscript] = useState('')
  const [sttSupported] = useState(() => speechRecognizer.isSupported)

  const pressActiveRef = useRef(false)
  const storyEngineRef = useRef<StoryEngine | null>(null)
  const fallbackAttemptsRef = useRef(0)
  const handlingRef = useRef(false)

  useEffect(() => {
    speechSynthesizer.init()
    return () => {
      speechSynthesizer.cancel()
      speechRecognizer.abort()
      llmEngine.destroyWorker()
    }
  }, [])

  const speakThenIdle = useCallback((text: string) => {
    setOrbState('speaking')
    speechSynthesizer.speak(text, { onEnd: () => setOrbState('idle') })
  }, [])

  const startModelLoad = useCallback((modelId: string) => {
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

  const generateStep = useCallback(
    async (engine: StoryEngine) => {
      setOrbState('loading')
      const { messages } = engine.nextStepMessages()
      try {
        const raw = await llmEngine.generate(messages)
        const parsed = parseStoryBeat(raw, engine.isFinalStep)
        if (!parsed.ok) {
          speakThenIdle(GENERIC_ERROR_MESSAGE)
          return
        }
        engine.setBeat(parsed.beat)
        setCurrentBeat(parsed.beat)
        const text =
          parsed.beat.isStoryEnd || engine.isFinalStep
            ? `${parsed.beat.narration}`
            : `${parsed.beat.narration} ${parsed.beat.choicePrompt}`
        speakThenIdle(text)
        if (parsed.beat.isStoryEnd || engine.isFinalStep) {
          setScreen('ended')
        }
      } catch {
        speakThenIdle(GENERIC_ERROR_MESSAGE)
      }
    },
    [speakThenIdle],
  )

  const handleAgeSelection = useCallback(
    (group: AgeGroup) => {
      const engine = new StoryEngine(group, 'una storia magica')
      storyEngineRef.current = engine
      fallbackAttemptsRef.current = 0
      setScreen('story')
      void generateStep(engine)
    },
    [generateStep],
  )

  const advanceWithChoice = useCallback(
    (engine: StoryEngine, option: StoryOption | null, transcript: string) => {
      if (option) {
        engine.registerChoice(option.label, transcript)
        fallbackAttemptsRef.current = 0
        setCurrentBeat(null)
        void generateStep(engine)
        return
      }
      fallbackAttemptsRef.current += 1
      const beat = engine.beat
      if (fallbackAttemptsRef.current >= 2 && beat && beat.options.length > 0) {
        speakThenIdle(FALLBACK_MESSAGE_2)
        return
      }
      speakThenIdle(FALLBACK_MESSAGE_1)
    },
    [speakThenIdle, generateStep],
  )

  const handleTranscript = useCallback(
    async (transcript: string) => {
      if (handlingRef.current) return
      const engine = storyEngineRef.current
      if (!engine || screen !== 'story') return
      handlingRef.current = true
      try {
        setLastTranscript(transcript)
        const beat = engine.beat ?? currentBeat
        if (!beat) return
        const { option } = matchTranscriptToOptions(transcript, beat.options)
        advanceWithChoice(engine, option, transcript)
      } finally {
        handlingRef.current = false
      }
    },
    [screen, currentBeat, advanceWithChoice],
  )

  const handleTranscriptRef = useRef(handleTranscript)
  useEffect(() => {
    handleTranscriptRef.current = handleTranscript
  }, [handleTranscript])

  const handlePressStart = useCallback(() => {
    if (pressActiveRef.current) return
    if (orbState === 'speaking' || orbState === 'loading') return
    if (!sttSupported) return
    pressActiveRef.current = true
    const started = speechRecognizer.start({
      onFinalResult: (transcript) => {
        pressActiveRef.current = false
        setOrbState('loading')
        handleTranscriptRef.current(transcript)
      },
      onError: () => {
        pressActiveRef.current = false
      },
    })
    if (started) {
      setOrbState('listening')
    }
  }, [orbState, sttSupported])

  const handlePressEnd = useCallback(() => {
    if (!pressActiveRef.current) return
    pressActiveRef.current = false
    speechRecognizer.stop()
  }, [])

  usePushToTalk({
    enabled:
      screen === 'story' &&
      sttSupported &&
      (orbState === 'idle' || orbState === 'listening'),
    onPressStart: handlePressStart,
    onPressEnd: handlePressEnd,
  })

  const handleChoiceButton = useCallback(
    (option: StoryOption) => {
      const engine = storyEngineRef.current
      if (!engine || screen !== 'story') return
      setLastTranscript(option.label)
      advanceWithChoice(engine, option, option.label)
    },
    [screen, advanceWithChoice],
  )

  const handleRestart = useCallback(() => {
    storyEngineRef.current = null
    setCurrentBeat(null)
    setLastTranscript('')
    fallbackAttemptsRef.current = 0
    setOrbState('idle')
    setScreen('age-selection')
  }, [])

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-slate-950 px-6 py-12 text-slate-100">
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
            onPressStart={handlePressStart}
            onPressEnd={handlePressEnd}
            disabled={screen === 'ended' || !sttSupported}
          />
          {currentBeat && !currentBeat.isStoryEnd && (
            <ChoiceButtons
              options={currentBeat.options}
              onChoose={handleChoiceButton}
              disabled={orbState === 'speaking' || orbState === 'loading'}
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

      <footer className="text-xs text-slate-600">
        Funziona interamente offline, nel tuo browser.
      </footer>
    </main>
  )
}
