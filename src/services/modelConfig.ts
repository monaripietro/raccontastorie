export type ModelChoice = {
  id: string
  name: string
  sizeLabel: string
  description: string
  recommended: boolean
}

export const MODEL_OPTIONS: ModelChoice[] = [
  {
    id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    name: 'Veloce',
    sizeLabel: 'circa 1 GB',
    description:
      "Si scarica in metà tempo ed è perfetto per connessioni lente. Le storie sono belle, un po' più semplici.",
    recommended: true,
  },
  {
    id: 'Qwen2.5-3B-Instruct-q4f16_1-MLC',
    name: 'Migliore',
    sizeLabel: 'circa 2 GB',
    description:
      'Storie più ricche e creative, con un download più lungo. Consigliato se hai una buona connessione.',
    recommended: false,
  },
]

export const DEFAULT_MODEL_ID = MODEL_OPTIONS[0].id

export function isWebGpuSupported(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator
}
