import { type LlmStatus } from '../services/llmEngine'
import { isWebGpuSupported } from '../services/modelConfig'

type ModelOnboardingProps = {
  status: LlmStatus
  onStart: () => void
}

export default function ModelOnboarding({
  status,
  onStart,
}: ModelOnboardingProps) {
  const webgpuSupported = isWebGpuSupported()

  if (!webgpuSupported) {
    return (
      <div className="max-w-md text-center">
        <h2 className="text-2xl font-semibold">WebGPU non disponibile</h2>
        <p className="mt-3 text-sm text-slate-300">
          Il racconto delle storie richiede un browser con WebGPU. Prova con
          una versione recente di Google Chrome o Microsoft Edge su desktop o
          Android.
        </p>
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
          onClick={onStart}
          className="mt-6 rounded-full bg-indigo-500 px-8 py-3 font-semibold text-white transition hover:bg-indigo-400 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-300/50"
        >
          Riprova
        </button>
      </div>
    )
  }

  return (
    <div className="flex max-w-md flex-col items-center text-center">
      <h2 className="text-2xl font-semibold">Prepariamo il narratore</h2>
      <p className="mt-3 text-sm text-slate-300">
        Al primo avvio scaricherò un piccolo modello di intelligenza
        artificiale direttamente nel tuo browser (circa 2 GB). Da quel momento
        tutto funziona offline: le tue storie restano solo su questo
        dispositivo.
      </p>
      <button
        type="button"
        onClick={onStart}
        className="mt-8 rounded-full bg-indigo-500 px-10 py-3 text-lg font-semibold text-white transition hover:bg-indigo-400 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-300/50"
      >
        Iniziamo
      </button>
    </div>
  )
}
