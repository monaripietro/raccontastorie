export type OrbState = 'idle' | 'speaking' | 'listening' | 'loading'

const VISUALS: Record<
  OrbState,
  { core: string; ring: string; animation: string; label: string }
> = {
  idle: {
    core: 'bg-indigo-400/60 shadow-indigo-500/40',
    ring: 'border-indigo-400/30',
    animation: 'animate-pulse-slow',
    label: 'Pronto. Tieni premuto per parlarmi.',
  },
  speaking: {
    core: 'bg-fuchsia-400/70 shadow-fuchsia-500/50',
    ring: 'border-fuchsia-400/30',
    animation: 'animate-wave',
    label: 'Sto raccontando...',
  },
  listening: {
    core: 'bg-emerald-400/70 shadow-emerald-500/50',
    ring: 'border-emerald-300/60',
    animation: 'animate-ping-slow',
    label: 'Ti ascolto...',
  },
  loading: {
    core: 'bg-amber-400/70 shadow-amber-500/50',
    ring: 'border-amber-300/40',
    animation: 'animate-spin-slow',
    label: 'Sto pensando...',
  },
}

type AudioOrbProps = {
  state: OrbState
  onPressStart?: () => void
  onPressEnd?: () => void
  disabled?: boolean
}

export default function AudioOrb({
  state,
  onPressStart,
  onPressEnd,
  disabled = false,
}: AudioOrbProps) {
  const visual = VISUALS[state]
  return (
    <div className="relative flex flex-col items-center">
      <div className="relative flex h-48 w-48 items-center justify-center sm:h-56 sm:w-56">
        <span
          className={`absolute inset-0 rounded-full border-4 ${visual.ring}`}
          aria-hidden="true"
        >
          <span
            className={`absolute inset-0 rounded-full border-4 ${visual.ring} ${visual.animation}`}
            aria-hidden="true"
          />
        </span>
        <button
          type="button"
          aria-label={`Orbe audio: ${visual.label}`}
          aria-pressed={state === 'listening'}
          disabled={disabled}
          className={`h-32 w-32 rounded-full shadow-lg transition-all duration-300 focus:outline-none focus-visible:ring-4 focus-visible:ring-white/40 sm:h-36 sm:w-36 ${visual.core} ${visual.animation} ${
            disabled
              ? 'cursor-not-allowed opacity-50'
              : 'cursor-pointer active:scale-95'
          }`}
          onTouchStart={(event) => {
            if (disabled) return
            event.preventDefault()
            onPressStart?.()
          }}
          onTouchEnd={(event) => {
            event.preventDefault()
            onPressEnd?.()
          }}
          onMouseDown={(event) => {
            if (disabled || event.button !== 0) return
            onPressStart?.()
          }}
          onMouseUp={() => onPressEnd?.()}
          onMouseLeave={() => {
            if (state === 'listening') onPressEnd?.()
          }}
        />
      </div>
      <p className="mt-4 text-sm font-medium text-slate-300" aria-live="polite">
        {visual.label}
      </p>
    </div>
  )
}
