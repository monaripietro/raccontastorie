import type {
  AgeGroup,
  StoryBeat,
  StoryChoiceMemory,
  StoryOption,
} from '../types/story'
import { AGE_PROFILES } from './ageProfiles'
import type { ChatMessage } from './llmEngine'

const JSON_SCHEMA_EXAMPLE = `{
  "narration": "Testo del capitolo da leggere con il TTS in italiano caldo e coinvolgente",
  "choice_prompt": "Cosa decidi di fare?",
  "options": [
    { "id": "A", "label": "Seguire le impronte luminose", "keywords": ["impronte", "seguire", "luminose", "luce"] },
    { "id": "B", "label": "Chiedere aiuto al gufo saggio", "keywords": ["gufo", "aiuto", "saggio", "uccello"] }
  ],
  "is_story_end": false
}`

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u'])

function stem(word: string): string {
  if (word.length > 3 && VOWELS.has(word[word.length - 1])) {
    return word.slice(0, -1)
  }
  return word
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = fenced ? fenced[1] : text
  const start = candidate.indexOf('{')
  const end = candidate.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  try {
    return JSON.parse(candidate.slice(start, end + 1))
  } catch {
    return null
  }
}

function isValidBeat(value: unknown, requireOptions: boolean): value is StoryBeat {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  if (typeof v.narration !== 'string' || v.narration.length === 0) return false
  if (typeof v.choice_prompt !== 'string') return false
  if (typeof v.is_story_end !== 'boolean') return false
  if (!Array.isArray(v.options)) return false
  if (requireOptions && v.options.length < 2) return false
  return v.options.every(
    (o) =>
      typeof o === 'object' &&
      o !== null &&
      typeof (o as Record<string, unknown>).id === 'string' &&
      typeof (o as Record<string, unknown>).label === 'string' &&
      Array.isArray((o as Record<string, unknown>).keywords),
  )
}

export type BuildPromptOptions = {
  ageGroup: AgeGroup
  storyTheme: string
  step: number
  isFinalStep: boolean
  choicesMemory: StoryChoiceMemory[]
}

export function buildStoryMessages({
  ageGroup,
  storyTheme,
  step,
  isFinalStep,
  choicesMemory,
}: BuildPromptOptions): ChatMessage[] {
  const profile = AGE_PROFILES[ageGroup]
  const currentPhase = profile.phases[step - 1]
  const memoryText =
    choicesMemory.length === 0
      ? 'Nessuna: è l’inizio della storia.'
      : choicesMemory
          .map(
            (m) =>
              `Tappa ${m.step} (${m.phase}): ha scelto "${m.chosenLabel}" dicendo "${m.transcript}"`,
          )
          .join('\n')

  const systemPrompt = `Sei Raccontastorie, un narratore vocale di storie interattive per bambini in lingua italiana. ${profile.styleGuide}

REGOLE FONDAMENTALI:
- Rispondi SEMPRE e SOLO con un oggetto JSON valido, senza testo prima o dopo, in questo formato esatto:
${JSON_SCHEMA_EXAMPLE}
- "narration": il testo del capitolo da recitare, in italiano caldo e coinvolgente. Massimo ${profile.narrationMaxWords} parole. NON includere la domanda finale.
- "choice_prompt": la domanda del bivio da porre al bambino.
- "options": ${profile.closedChoices ? 'esattamente 2 opzioni' : '2 o 3 opzioni'} chiare, ognuna con "id" (A, B, C...), "label" (breve descrizione della scelta) e "keywords" (4-6 parole chiave che un bambino potrebbe dire per scegliere questa opzione).
- "is_story_end": true SOLO se questa è la tappa finale e la storia deve concludersi${isFinalStep ? ' (questa È la tappa finale: chiudi la storia con un lieto fine e is_story_end = true, con options vuota o quasi)' : ' (false altrimenti)'}.
- Ogni frase di "narration" deve avere al massimo ${profile.maxSentenceWords} parole.
- Non usare mai emoji, elenchi puntati o markdown: il testo verrà letto ad alta voce.`

  const userPrompt = `Continua la storia interattiva.

TEMA DELLA STORIA: ${storyTheme}
FASE NARRATIVA CORRENTE: ${currentPhase.name} — ${currentPhase.description}
TAPPA: ${step} di ${profile.totalSteps}
MEMORIA DELLE SCELTE PRECEDENTI DEL BAMBINO:
${memoryText}

Genera la tappa ${step} rispettando la fase narrativa indicata.`

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]
}

export type ParseResult =
  | { ok: true; beat: StoryBeat }
  | { ok: false; error: string }

export function parseStoryBeat(raw: string, isFinalStep: boolean): ParseResult {
  const parsed = extractJson(raw)
  if (parsed === null) {
    return { ok: false, error: 'Risposta del modello senza JSON valido' }
  }
  if (!isValidBeat(parsed, !isFinalStep)) {
    return { ok: false, error: 'Struttura del beat non valida' }
  }
  const v = parsed as Record<string, unknown>
  const options = (v.options as Array<Record<string, unknown>>).map((o) => ({
    id: String(o.id),
    label: String(o.label),
    keywords: (o.keywords as string[]).map((k) => String(k)),
  }))
  return {
    ok: true,
    beat: {
      narration: String(v.narration),
      choicePrompt: String(v.choice_prompt),
      options,
      isStoryEnd: Boolean(v.is_story_end),
    },
  }
}

export type MatchResult = {
  option: StoryOption | null
  confidence: 'high' | 'low' | 'none'
}

export function matchTranscriptToOptions(
  transcript: string,
  options: StoryOption[],
): MatchResult {
  const text = normalizeText(transcript)
  if (text.length === 0) return { option: null, confidence: 'none' }
  const words = new Set(
    text.split(' ').filter((w) => w.length > 2).map(stem),
  )
  if (words.size === 0) return { option: null, confidence: 'none' }

  let best: { option: StoryOption; score: number } | null = null
  let secondBestScore = 0
  for (const option of options) {
    let score = 0
    for (const keyword of option.keywords) {
      const keywordStem = stem(normalizeText(keyword))
      if (keywordStem.length === 0) continue
      if (text.includes(keywordStem)) {
        score += 2
        continue
      }
      for (const word of words) {
        if (
          word.startsWith(keywordStem) ||
          keywordStem.startsWith(word)
        ) {
          score += 1
          break
        }
      }
    }
    if (best === null || score > best.score) {
      if (best !== null) secondBestScore = best.score
      best = { option, score }
    } else if (score > secondBestScore) {
      secondBestScore = score
    }
  }
  if (!best || best.score === 0) return { option: null, confidence: 'none' }
  const confidence =
    best.score >= 3 || best.score - secondBestScore >= 2 ? 'high' : 'low'
  return { option: best.option, confidence }
}

export class StoryEngine {
  private step = 0
  private readonly ageGroup: AgeGroup
  private storyTheme: string
  private choicesMemory: StoryChoiceMemory[] = []
  private currentBeat: StoryBeat | null = null

  constructor(ageGroup: AgeGroup, storyTheme: string) {
    this.ageGroup = ageGroup
    this.storyTheme = storyTheme
  }

  get profile() {
    return AGE_PROFILES[this.ageGroup]
  }

  get currentStep(): number {
    return this.step
  }

  get totalSteps(): number {
    return this.profile.totalSteps
  }

  get isFinalStep(): boolean {
    return this.step >= this.profile.totalSteps
  }

  get beat(): StoryBeat | null {
    return this.currentBeat
  }

  get memory(): readonly StoryChoiceMemory[] {
    return this.choicesMemory
  }

  get theme(): string {
    return this.storyTheme
  }

  setTheme(theme: string): void {
    this.storyTheme = theme
  }

  nextStepMessages(): { messages: ChatMessage[]; step: number } {
    this.step = Math.min(this.step + 1, this.profile.totalSteps)
    return {
      step: this.step,
      messages: buildStoryMessages({
        ageGroup: this.ageGroup,
        storyTheme: this.storyTheme,
        step: this.step,
        isFinalStep: this.step >= this.profile.totalSteps,
        choicesMemory: this.choicesMemory,
      }),
    }
  }

  retryMessages(): { messages: ChatMessage[]; step: number } {
    return {
      step: this.step,
      messages: buildStoryMessages({
        ageGroup: this.ageGroup,
        storyTheme: this.storyTheme,
        step: this.step,
        isFinalStep: this.step >= this.profile.totalSteps,
        choicesMemory: this.choicesMemory,
      }),
    }
  }

  registerChoice(chosenLabel: string, transcript: string): void {
    this.choicesMemory.push({
      step: this.step,
      phase: this.profile.phases[this.step - 1]?.name ?? '',
      chosenLabel,
      transcript,
    })
  }

  setBeat(beat: StoryBeat): void {
    this.currentBeat = beat
  }
}
