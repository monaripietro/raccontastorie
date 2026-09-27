import type {
  AgeGroup,
  StoryBeat,
  StoryChoiceMemory,
  StoryOption,
} from '../types/story'
import { AGE_PROFILES } from './ageProfiles'
import type { ChatMessage } from './llmEngine'

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

const CLOSED_SCHEMA = `{
  "narration": "...",
  "choice_prompt": "...",
  "options": [
    { "id": "A", "label": "...", "keywords": ["..."] },
    { "id": "B", "label": "...", "keywords": ["..."] }
  ],
  "is_story_end": false
}`

const HYBRID_SCHEMA = `{
  "narration": "...",
  "choice_prompt": "...",
  "options": [
    { "id": "A", "label": "...", "keywords": ["..."] },
    { "id": "B", "label": "...", "keywords": ["..."] },
    { "id": "C", "label": "...", "keywords": ["..."] }
  ],
  "is_story_end": false
}`

const OPEN_SCHEMA = `{
  "narration": "...",
  "choice_prompt": "...",
  "options": [],
  "is_story_end": false
}`

const CHOICE_RULES: Record<string, string> = {
  closed:
    'Alla fine di ogni tappa (tranne l\u2019ultima) offre SEMPRE esattamente 2 opzioni chiuse e polarizzate, enunciate ad alta voce nella choice_prompt (per esempio: "Vuoi seguire le luci lampeggianti o vuoi parlare con il gufo saggio?"). Il bambino piccolo non deve inventare nulla: le opzioni gliele offre la voce narrante e lui sceglie tra quelle due.',
  hybrid:
    'Alla fine di ogni tappa (tranne l\u2019ultima) offre 2 o 3 opzioni descrittive, e PUÒ aggiungere come ultima alternativa una domanda aperta ("oppure tu cosa faresti?"). Il bambino può scegliere una delle opzioni proposte oppure proporre una sua idea.',
  open:
    'Alla fine di ogni tappa (tranne l\u2019ultima) NON propone opzioni precostituite: la choice_prompt è una domanda aperta sul bivio (per esempio "Cosa decidi di fare per superare il burrone?"). È il ragazzo a decidere liberamente come procedere, e la sua idea diventa la trama della tappa successiva.',
}

export type BuildPromptOptions = {
  ageGroup: AgeGroup
  storyTitle: string
  storyTheme: string
  step: number
  isFinalStep: boolean
  choicesMemory: StoryChoiceMemory[]
}

export function buildStoryMessages({
  ageGroup,
  storyTitle,
  storyTheme,
  step,
  isFinalStep,
  choicesMemory,
}: BuildPromptOptions): ChatMessage[] {
  const profile = AGE_PROFILES[ageGroup]
  const currentPhase = profile.phases[step - 1]
  const memoryText =
    choicesMemory.length === 0
      ? 'Nessuna: è l\u2019inizio della storia.'
      : choicesMemory
          .map(
            (m) =>
              `Tappa ${m.step} (${m.phase}): ha scelto "${m.chosenLabel}" dicendo "${m.transcript}"`,
          )
          .join('\n')

  const schema =
    profile.choiceMode === 'closed'
      ? CLOSED_SCHEMA
      : profile.choiceMode === 'hybrid'
        ? HYBRID_SCHEMA
        : OPEN_SCHEMA

  const systemPrompt = `Sei Raccontastorie, un narratore vocale di storie interattive per bambini in lingua italiana. ${profile.styleGuide}

REGOLE FONDAMENTALI:
- Rispondi SEMPRE e SOLO con un oggetto JSON valido, senza testo prima o dopo, in questo formato esatto:
${schema}
- "narration": il testo del capitolo da recitare, in italiano caldo e coinvolgente. Massimo ${profile.narrationMaxWords} parole. NON includere la domanda finale del bivio.
- "choice_prompt": la domanda del bivio da porre al bambino, da leggere ad alta voce subito dopo la narrazione.
- "options": le opzioni del bivio con "id" (A, B, C...), "label" (breve descrizione) e "keywords" (4-6 parole che il bambino potrebbe dire per scegliere questa opzione).
- "is_story_end": true SOLO se questa è la tappa finale e la storia deve concludersi${isFinalStep ? ' (QUESTA è la tappa finale: chiudi la storia con un lieto fine e is_story_end = true, con options vuota)' : ' (false altrimenti)'}.
- Ogni frase di "narration" deve avere al massimo ${profile.maxSentenceWords} parole.
- Non usare mai emoji, elenchi puntati o markdown: il testo verrà letto ad alta voce.

GESTIONE DEI BIVI:
${CHOICE_RULES[profile.choiceMode]}

STRUTTURA OBBLIGATORIA — VIAGGIO DELL'EROE:
La storia DEVE seguire le tappe del viaggio dell'eroe riportate di seguito, nell'ordine, una per generazione. Non saltare nessuna tappa e non anticipare eventi delle tappe successive.`

  const userPrompt = `Continua la storia interattiva.

TITOLO DELLA STORIA: "${storyTitle}"
TEMA DESIDERATO DAL BAMBINO: ${storyTheme}
FASE NARRATIVA CORRENTE: ${currentPhase.name} — ${currentPhase.description}
TAPPA: ${step} di ${profile.totalSteps}
MEMORIA DELLE SCELTE PRECEDENTI DEL BAMBINO:
${memoryText}

Genera la tappa ${step} rispettando la fase narrativa indicata${isFinalStep ? ' e chiudi la storia con un lieto finale' : ''}. La narrazione deve essere coerente con il titolo, il tema e le scelte fatte finora.`

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]
}

export type BuildTitleMessagesOptions = {
  ageGroup: AgeGroup
  storyTheme: string
}

export function buildTitleMessages({
  ageGroup,
  storyTheme,
}: BuildTitleMessagesOptions): ChatMessage[] {
  const profile = AGE_PROFILES[ageGroup]
  const wantsAuto = normalizeText(storyTheme).length < 2
  const themeText = wantsAuto
    ? 'Il bambino non ha detto un tema: inventa tu liberamente un tema adatto alla sua fascia d\u2019età.'
    : `Il bambino ha chiesto una storia su: "${storyTheme}"`

  return [
    {
      role: 'system',
      content: `Sei Raccontastorie, un narratore di storie per bambini in lingua italiana. Rispondi SEMPRE e SOLO con un oggetto JSON valido, senza altro testo, in questo formato:
{ "title": "..." }

Il titolo deve essere ONIRICO E AMPIO, mai troppo specifico o descrittivo. Formula giusta: "L'avventura di ..." o "Il segreto di ..." seguito da un nome evocativo e misterioso (per esempio: "L'avventura della Stella Sussurrante", "Il segreto del Bosco che Ride"). Adatto alla fascia ${profile.label}. Massimo 7 parole. Niente emoji, niente virgolette dentro il titolo.`,
    },
    {
      role: 'user',
      content: `${themeText}

Inventa il titolo onirico della storia.`,
    },
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
  const requireOptions = !isFinalStep
  if (!isValidBeat(parsed, requireOptions)) {
    return { ok: false, error: 'Struttura del beat non valida' }
  }
  const v = parsed as Record<string, unknown>
  const options = (
    v.options as Array<Record<string, unknown>>
  ).map((o) => ({
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

export type TitleResult =
  | { ok: true; title: string }
  | { ok: false; error: string }

export function parseTitle(raw: string): TitleResult {
  const parsed = extractJson(raw)
  const title =
    typeof parsed === 'object' &&
    parsed !== null &&
    typeof (parsed as Record<string, unknown>).title === 'string'
      ? ((parsed as Record<string, unknown>).title as string).trim()
      : ''
  if (title.length === 0) {
    return { ok: false, error: 'Risposta del modello senza titolo valido' }
  }
  return { ok: true, title }
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

const STOP_WORDS = new Set([
  'scegli',
  'voglio',
  'vorrei',
  'allora',
  'facciamo',
  'dunque',
  'quindi',
  'direi',
  'penso',
  'forse',
  'cosa',
  'per',
  'con',
  'che',
  'una',
  'uno',
  'del',
  'della',
  'dei',
  'delle',
  'gli',
  'the',
])

export function isMeaningfulTranscript(transcript: string): boolean {
  const text = normalizeText(transcript)
  if (text.length < 3) return false
  const words = text.split(' ').filter((w) => w.length > 2 && !STOP_WORDS.has(w))
  return words.length > 0
}

export class StoryEngine {
  private step = 0
  private readonly ageGroup: AgeGroup
  private storyTitle = ''
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

  get title(): string {
    return this.storyTitle
  }

  setTitle(title: string): void {
    this.storyTitle = title
  }

  setTheme(theme: string): void {
    this.storyTheme = theme
  }

  titleMessages(): ChatMessage[] {
    return buildTitleMessages({
      ageGroup: this.ageGroup,
      storyTheme: this.storyTheme,
    })
  }

  private phaseNameForStep(step: number): string {
    const phases = this.profile.phases
    const clamped = Math.min(Math.max(step, 1), phases.length)
    return phases[clamped - 1]?.name ?? 'bivio'
  }

  nextStepMessages(): { messages: ChatMessage[]; step: number } {
    this.step = Math.min(this.step + 1, this.profile.totalSteps)
    return {
      step: this.step,
      messages: buildStoryMessages({
        ageGroup: this.ageGroup,
        storyTitle: this.storyTitle,
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
        storyTitle: this.storyTitle,
        storyTheme: this.storyTheme,
        step: this.step,
        isFinalStep: this.step >= this.profile.totalSteps,
        choicesMemory: this.choicesMemory,
      }),
    }
  }

  registerChoice(chosenLabel: string, transcript: string): void {
    this.choicesMemory.push({
      step: Math.max(this.step - 1, 0),
      phase: this.phaseNameForStep(Math.max(this.step - 1, 1)),
      chosenLabel,
      transcript,
    })
  }

  setBeat(beat: StoryBeat): void {
    this.currentBeat = beat
  }
}
