import { useState } from 'react'
import { type LlmStatus } from '../services/llmEngine'
import {
  isWebGpuSupported,
  MODEL_OPTIONS,
  type ModelChoice,
} from '../services/modelConfig'

type EngineKind = 'webgpu' | 'openrouter'

type ModelOnboardingProps = {
  status: LlmStatus
  onStart: (modelId: string) => void
  onOpenRouterStart: (apiKey: string) => void
}

export default function ModelOnboarding({
  status,
  onStart,
  onOpenRouterStart,
}: ModelOnboardingProps) {
  const [engine, setEngine] = useState<EngineKind | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [consent, setConsent] = useState(false)
  const webgpuSupported = isWebGpuSupported()

  if (engine === null) {
    return (
      <div className="flex max-w-2xl flex-col items-center gap-6 text-center">
        <h2 className="text-2xl font-semibold">Prepariamo il narratore</h2>
        <p className="max-w-lg text-sm text-slate-300">
          Scegli come far funzionare la magia delle storie. Nessuna chiave o
          dato lascia mai il tuo browser senza il tuo consenso.
        </p>
        <div
          className="max-w-xl rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-3"
          role="note"
          aria-label="Nota sulla privacy"
        >
          <p className="text-xs text-emerald-200">
            🔒 La tua privacy: se scegli il modello locale, le storie non
            lasciano mai il tuo dispositivo e non sono usate per allenare
            alcun modello. La voce narrante usa il sintetizzatore del tuo
            browser.
          </p>
        </div>
        <div className="mt-4 grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setEngine('webgpu')}
            className="flex flex-col items-center gap-2 rounded-2xl border border-indigo-400/20 bg-slate-900/60 px-6 py-8 transition hover:border-indigo-400/60 hover:bg-slate-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-300/50"
          >
            <span className="text-lg font-semibold">Sul tuo dispositivo</span>
            <span className="text-xs text-indigo-300">Offline · gratuito</span>
            <span className="text-xs text-slate-400">
              Scarica il modello nel browser (prima volta) e poi tutto resta
              sul dispositivo. Richiede un dispositivo potente.
            </span>
            <span className="mt-2 rounded-lg bg-emerald-400/10 px-3 py-2 text-[11px] leading-snug text-emerald-200">
              🔒 Le storie e la voce restano nel tuo browser: nessun dato è
              memorizzato sui server né usato per allenare i modelli.
            </span>
          </button>
          <button
            type="button"
            onClick={() => setEngine('openrouter')}
            className="flex flex-col items-center gap-2 rounded-2xl border border-emerald-400/20 bg-slate-900/60 px-6 py-8 transition hover:border-emerald-400/60 hover:bg-slate-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300/50"
          >
            <span className="text-lg font-semibold">OpenRouter</span>
            <span className="text-xs text-emerald-300">
              Veloce · modello gratuito
            </span>
            <span className="text-xs text-slate-400">
              Incolla la tua chiave API: viene usata solo in questa scheda e
              mai salvata su disco.
            </span>
            <span className="mt-2 rounded-lg bg-amber-400/10 px-3 py-2 text-[11px] leading-snug text-amber-200">
              ⚠️ Le frasi della storia vengono inviate ai server OpenRouter:
              alcuni modelli gratuiti possono usarle per l'addestramento.
            </span>
          </button>
        </div>
      </div>
    )
  }

  if (engine === 'openrouter') {
    return (
      <div className="flex w-full max-w-md flex-col items-center gap-4 text-center">
        <h2 className="text-2xl font-semibold">Chiave OpenRouter</h2>
        <p className="text-sm text-slate-300">
          Crea una chiave gratuita su{' '}
          <a
            href="https://openrouter.ai/settings/keys"
            target="_blank"
            rel="noreferrer"
            className="text-emerald-300 underline"
          >
            openrouter.ai
          </a>{' '}
          e incollala qui. Resta solo in memoria, in questa scheda: chiusa la
          pagina scompare.
        </p>
        <div
          className="w-full rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-left"
          role="alert"
        >
          <p className="text-xs leading-relaxed text-amber-200">
            <strong>Attenzione privacy:</strong> con OpenRouter le frasi della
            storia vengono inviate ai loro server e i messaggi inviati al
            modello possono essere usati per allenare i modelli gratuiti.
          </p>
        </div>
        <label className="flex w-full items-start gap-3 text-left">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-600 bg-slate-900 accent-emerald-500"
          />
          <span className="text-xs leading-relaxed text-slate-300">
            Ho capito: i contenuti della storia saranno inviati a OpenRouter
            e potrebbero essere usati per allenare i modelli. La mia chiave
            resta solo in memoria in questa scheda.
          </span>
        </label>
        <div className="flex w-full items-center gap-2">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="sk-or-v1-..."
            autoComplete="off"
            spellCheck={false}
            aria-label="Chiave API OpenRouter"
            className="w-full rounded-xl border border-slate-600 bg-slate-900/80 px-4 py-3 text-sm text-slate-100 focus:border-emerald-400/60 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300/40"
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            className="rounded-xl border border-slate-600 bg-slate-900/80 px-4 py-3 text-sm text-slate-300 transition hover:border-emerald-400/60"
          >
            {showKey ? 'Nascondi' : 'Mostra'}
          </button>
        </div>
        <button
          type="button"
          disabled={apiKey.trim().length < 10 || !consent}
          onClick={() => onOpenRouterStart(apiKey.trim())}
          className="rounded-full bg-emerald-500 px-8 py-3 font-semibold text-white transition hover:bg-emerald-400 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300/50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Inizia a raccontare
        </button>
        <button
          type="button"
          onClick={() => setEngine(null)}
          className="text-xs text-slate-500 underline transition hover:text-slate-300"
        >
          Torna indietro
        </button>
      </div>
    )
  }

  if (!webgpuSupported) {
    return (
      <div className="max-w-md text-center">
        <h2 className="text-2xl font-semibold">WebGPU non disponibile</h2>
        <p className="mt-3 text-sm text-slate-300">
          Il racconto locale richiede Google Chrome su desktop con WebGPU,
          oppure puoi usare OpenRouter.
        </p>
        <button
          type="button"
          onClick={() => setEngine(null)}
          className="mt-6 rounded-full bg-indigo-500 px-8 py-3 font-semibold text-white transition hover:bg-indigo-400"
        >
          Torna alla scelta
        </button>
      </div>
    )
  }

  if (status.phase === 'loading') {
    const label =
      status.text.length > 0
        ? status.text
        : 'Sto preparando la magia delle storie...'
    return (
      <div className="flex w-full max-w-md flex-col items-center gap-4 text-center">
        <div className="h-3 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 transition-all duration-300"
            style={{ width: `${status.progress}%` }}
            role="progressbar"
            aria-valuenow={status.progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Avanzamento del download del modello"
          />
        </div>
        <p className="text-sm text-slate-300" aria-live="polite">
          {label}
        </p>
        <p className="text-xs text-slate-500">
          {status.progress}% — solo la prima volta: poi il modello resta
          salvato nel tuo browser e non verrà più scaricato.
        </p>
      </div>
    )
  }

  if (status.phase === 'error') {
    return (
      <div className="max-w-md text-center">
        <h2 className="text-2xl font-semibold text-red-400">
          Qualcosa è andato storto
        </h2>
        <p className="mt-3 text-sm text-slate-300">{status.error}</p>
        <button
          type="button"
          onClick={() => onStart(MODEL_OPTIONS[0].id)}
          className="mt-6 rounded-full bg-indigo-500 px-8 py-3 font-semibold text-white transition hover:bg-indigo-400"
        >
          Riprova
        </button>
      </div>
    )
  }

  const handleStart = (choice: ModelChoice) => onStart(choice.id)

  return (
    <div className="flex max-w-2xl flex-col items-center text-center">
      <h2 className="text-2xl font-semibold">Che narratore preferisci?</h2>
      <p className="mt-3 max-w-lg text-sm text-slate-300">
        Al primo avvio scaricherò un piccolo modello di intelligenza
        artificiale direttamente nel tuo browser. Da quel momento tutto
        funziona offline: le tue storie restano solo su questo dispositivo.
      </p>
      <div className="mt-8 grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
        {MODEL_OPTIONS.map((choice) => (
          <button
            key={choice.id}
            type="button"
            onClick={() => handleStart(choice)}
            className="flex flex-col items-center gap-2 rounded-2xl border border-indigo-400/20 bg-slate-900/60 px-6 py-6 transition hover:border-indigo-400/60 hover:bg-slate-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-300/50"
          >
            <span className="text-lg font-semibold">{choice.name}</span>
            <span className="text-xs font-medium text-indigo-300">
              {choice.sizeLabel}
              {choice.recommended ? ' · consigliato' : ''}
            </span>
            <span className="text-xs text-slate-400">{choice.description}</span>
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setEngine(null)}
        className="mt-6 text-xs text-slate-500 underline transition hover:text-slate-300"
      >
        Torna alla scelta del motore
      </button>
    </div>
  )
}
