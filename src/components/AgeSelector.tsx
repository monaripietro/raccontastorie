import type { AgeGroup } from '../types/story'
import { AGE_PROFILES } from '../services/ageProfiles'

const GROUPS: { id: AgeGroup; emoji: string }[] = [
  { id: '3-5', emoji: '🐻' },
  { id: '6-9', emoji: '🦊' },
  { id: '10+', emoji: '🐉' },
]

type AgeSelectorProps = {
  onSelect: (group: AgeGroup) => void
  disabled?: boolean
}

export default function AgeSelector({
  onSelect,
  disabled = false,
}: AgeSelectorProps) {
  return (
    <div className="flex max-w-2xl flex-col items-center gap-6 text-center">
      <h2 className="text-2xl font-semibold">Quanti anni hai?</h2>
      <p className="text-sm text-slate-400">
        Scegli la tua fascia d'età: adatterò le storie a te.
      </p>
      <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-3">
        {GROUPS.map(({ id, emoji }) => (
          <button
            key={id}
            type="button"
            disabled={disabled}
            onClick={() => onSelect(id)}
            className="flex flex-col items-center gap-2 rounded-2xl border border-indigo-400/20 bg-slate-900/60 px-6 py-8 transition hover:border-indigo-400/60 hover:bg-slate-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-300/50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="text-4xl" aria-hidden="true">
              {emoji}
            </span>
            <span className="text-lg font-semibold">
              {AGE_PROFILES[id].label}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
