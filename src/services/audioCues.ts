export type CueKind = 'listening-on' | 'listening-off'

type AudioContextLike = {
  state: string
  resume: () => Promise<void>
  currentTime: number
  createOscillator: () => {
    type: string
    frequency: {
      setValueAtTime: (value: number, time: number) => void
      exponentialRampToValueAtTime: (value: number, time: number) => void
    }
    connect: (node: unknown) => void
    start: (time: number) => void
    stop: (time: number) => void
  }
  createGain: () => {
    gain: {
      setValueAtTime: (value: number, time: number) => void
      exponentialRampToValueAtTime: (value: number, time: number) => void
    }
    connect: (node: unknown) => void
  }
  destination: unknown
}

let ctx: AudioContextLike | null = null

function ensureContext(): AudioContextLike | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as Record<string, unknown>
  const Ctor = (w.AudioContext ?? w.webkitAudioContext) as
    | (new () => AudioContextLike)
    | undefined
  if (!Ctor) return null
  if (!ctx) ctx = new Ctor()
  if (ctx.state === 'suspended') void ctx.resume()
  return ctx
}

function playTone(
  context: AudioContextLike,
  fromHz: number,
  toHz: number,
  durationS: number,
  delayS = 0,
): void {
  const startAt = context.currentTime + delayS
  const osc = context.createOscillator()
  const gain = context.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(fromHz, startAt)
  osc.frequency.exponentialRampToValueAtTime(toHz, startAt + durationS)
  gain.gain.setValueAtTime(0.0001, startAt)
  gain.gain.exponentialRampToValueAtTime(0.12, startAt + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + durationS)
  osc.connect(gain)
  gain.connect(context.destination)
  osc.start(startAt)
  osc.stop(startAt + durationS + 0.05)
}

export function playListenCue(kind: CueKind): void {
  const context = ensureContext()
  if (!context) return
  try {
    if (kind === 'listening-on') {
      playTone(context, 520, 820, 0.16)
    } else {
      playTone(context, 620, 360, 0.18)
    }
  } catch {
    // audio non disponibile: nessun segnale, il flusso continua
  }
}
