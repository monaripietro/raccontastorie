import { useCallback, useEffect, useRef, useState } from 'react'
import AudioOrb, { type OrbState } from './components/AudioOrb'
import ModelOnboarding from './components/ModelOnboarding'
import { usePushToTalk } from './hooks/usePushToTalk'
import { llmEngine, type LlmStatus } from './services/llmEngine'
import { speechRecognizer } from './services/speechRecognizer'
import { speechSynthesizer } from './services/speechSynthesizer'

const WELCOME_MESSAGE =
  "Ciao! Sono Raccontastorie. Tieni premuta la barra spaziatrice, oppure tocca il disco luminoso, per parlarmi. Quando hai finito, rilasciala."

type Screen = 'onboarding' | 'story'

const DEMO_SYSTEM_PROMPT =
  'Sei un narratore di storie per bambini. Rispondi in italiano, con un tono caldo e coinvolgente, in non più di due frasi.'

export default function App() {
  const [screen, setScreen] = useState<Screen>('onboarding')
  const [llmStatus, setLlmStatus] = useState<LlmStatus>({ phase: 'idle' })
  const [orbState, setOrbState] = useState<OrbState>('speaking')
  const [lastTranscript, setLastTranscript] = useState('')
  const [ttsSupported] = useState(() => speechSynthesizer.isSupported)
  const [sttSupported] = useState(() => speechRecognizer.isSupported)
  const pressActiveRef = useRef(false)
  const handleTranscriptRef = useRef<(transcript: string) => void>(() => {})

  useEffect(() => {
    speechSynthesizer.init()
    return () => {
      speechSynthesizer.cancel()
      speechRecognizer.abort()
      llmEngine.destroyWorker()
    }
  }, [])

  const startModelLoad = useCallback(() => {
    setLlmStatus({ phase: 'loading', progress: 0, text: '' })
    llmEngine.load((status) => {
      setLlmStatus(status)
      if (status.phase === 'ready') {
        setScreen('story')
        speechSynthesizer.speak(WELCOME_MESSAGE, {
          onEnd: () => setOrbState('idle'),
        })
      }
    })
  }, [])

  const handlePressStart = useCallback(() => {
    if (pressActiveRef.current) return
    if (orbState === 'speaking' || orbState === 'loading') return
    if (!sttSupported) return
    pressActiveRef.current = true
    const started = speechRecognizer.start({
      onFinalResult: (transcript) => {
        pressActiveRef.current = false
        setOrbState('loading')
        setLastTranscript(transcript)
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

  const handleTranscript = useCallback(async (transcript: string) => {
      if (transcript.length === 0) {
        setOrbState('speaking')
        speechSynthesizer.speak(
          'Non sono riuscito a sentirti bene. Tieni premuta la barra spaziatrice e ripetimi cosa vuoi fare.',
          { onEnd: () => setOrbState('idle') },
        )
        return
      }
      try {
        const reply = await llmEngine.generate([
          { role: 'system', content: DEMO_SYSTEM_PROMPT },
          { role: 'user', content: transcript },
        ])
        setOrbState('speaking')
        speechSynthesizer.speak(reply, {
          onEnd: () => setOrbState('idle'),
        })
      } catch {
        setOrbState('speaking')
        speechSynthesizer.speak(
          'Scusa, mi sono distratto un attimo. Ripetimi cosa vuoi fare.',
          { onEnd: () => setOrbState('idle') },
        )
      }
  }, [])

  useEffect(() => {
    handleTranscriptRef.current = handleTranscript
  }, [handleTranscript])

  usePushToTalk({
    enabled:
      screen === 'story' &&
      sttSupported &&
      (orbState === 'idle' || orbState === 'listening'),
    onPressStart: handlePressStart,
    onPressEnd: handlePressEnd,
  })

  const supported = ttsSupported || sttSupported

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-slate-950 px-6 py-12 text-slate-100">
      <header className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">Raccontastorie</h1>
        <p className="mt-2 text-sm text-slate-400">
          Il tuo narratore interattivo a bivi
        </p>
      </header>

      {screen === 'onboarding' ? (
        <ModelOnboarding status={llmStatus} onStart={startModelLoad} />
      ) : (
        <>
          {!supported && (
            <p
              className="max-w-md rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-center text-sm text-amber-200"
              role="alert"
            >
              Questo browser non supporta la sintesi vocale o il riconoscimento
              vocale. Prova con Google Chrome su desktop o Android.
            </p>
          )}
          <AudioOrb
            state={orbState}
            onPressStart={handlePressStart}
            onPressEnd={handlePressEnd}
            disabled={!sttSupported}
          />
          {lastTranscript.length > 0 && (
            <p
              className="max-w-md text-center text-base text-slate-300"
              aria-live="polite"
            >
              «{lastTranscript}»
            </p>
          )}
        </>
      )}

      <footer className="text-xs text-slate-600">
        Funziona interamente offline, nel tuo browser.
      </footer>
    </main>
  )
}
