import type { StoryOption } from '../types/story'

type ChoiceButtonsProps = {
  options: StoryOption[]
  onChoose: (option: StoryOption) => void
  disabled?: boolean
}

export default function ChoiceButtons({
  options,
  onChoose,
  disabled = false,
}: ChoiceButtonsProps) {
  if (options.length === 0) return null
  return (
    <div
      className="flex max-w-xl flex-wrap items-center justify-center gap-4"
      role="group"
      aria-label="Scelte della storia"
    >
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          disabled={disabled}
          onClick={() => onChoose(option)}
          className="rounded-full border border-slate-600 bg-slate-800/80 px-6 py-3 text-base font-medium text-slate-100 transition hover:border-emerald-400/60 hover:bg-slate-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
