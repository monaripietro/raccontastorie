import { useCallback, useEffect, useRef, useState } from 'react'
import AudioOrb, { type OrbState } from './components/AudioOrb'
import { usePushToTalk } from './hooks/usePushToTalk'
import { speechRecognizer } from './services/speechRecognizer'
import { speechSynthesizer } from './services/speechSynthesizer'

const WELCOME_MESSAGE =
  "Ciao! Sono Raccontastorie. Tieni premuta la barra spaziatrice, oppure tocca il disco luminoso, per parlarmi. Quando hai finito, rilasciala."

export default function App() {
  const [orbState, setOrbState] = useState<OrbState>('speaking')
  const [lastTranscript, setLastTranscript] = useState('')
  const [ttsSupported] = useState(() => speechSynthesizer.isSupported)
  const [sttSupported] = useState(() => speechRecognizer.isSupported)
  const pressActiveRef = useRef(false)

  useEffect(() => {
    speechSynthesizer.init()
    speechSynthesizer.speak(WELCOME_MESSAGE, {
      onEnd: () => setOrbState('idle'),
    })
    return () => {
      speechSynthesizer.cancel()
      speechRecognizer.abort()
    }
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
        window.setTimeout(() => {
          const reply = transcript.length > 0
            ? `Ho capito: ${transcript}. Che bella idea! Presto ti racconterò una storia con la tua scelta.`
            : 'Non sono riuscito a sentirti bene. Tieni premuta la barra spaziatrice e ripetimi cosa vuoi fare.'
          setOrbState('speaking')
          speechSynthesizer.speak(reply, {
            onEnd: () => setOrbState('idle'),
          })
        }, 600)
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
    enabled: sttSupported && (orbState === 'idle' || orbState === 'listening'),
    onPressStart: handlePressStart,
    onPressEnd: handlePressEnd,
  })

  const supported = ttsSupported || sttSupported

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-slate-950 px-6 text-slate-100">
      <header className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">Raccontastorie</h1>
        <p className="mt-2 text-sm text-slate-400">
          Il tuo narratore interattivo a bivi
        </p>
      </header>

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
        <p className="max-w-md text-center text-base text-slate-300" aria-live="polite">
          «{lastTranscript}»
        </p>
      )}

      <footer className="text-xs text-slate-600">
        Funziona interamente offline, nel tuo browser.
      </footer>
    </main>
  )
}
