import type {
  AgeGroup,
  AgeStyle,
  ChatMessage,
  HeroChapter,
} from '../types/story'

export const HERO_JOURNEY: HeroChapter[] = [
  {
    index: 1,
    title: 'Il mondo ordinario',
    guidance:
      'Presenta il protagonista nella sua realtà quotidiana: fai vedere come vive, cosa ama e cosa desidera nel suo ambiente familiare.',
  },
  {
    index: 2,
    title: 'La chiamata all’avventura',
    guidance:
      'Un problema, una sfida o una proposta d’avventura stravolge l’equilibrio del mondo ordinario e chiarisce l’obiettivo finale del protagonista.',
  },
  {
    index: 3,
    title: 'Il rifiuto della chiamata',
    guidance:
      'Il protagonista esita e rifiuta la sfida: mostra le sue paure e la sua mancanza di volontà di mettersi in gioco.',
  },
  {
    index: 4,
    title: 'L’incontro con il mentore',
    guidance:
      'Una figura saggia e amica aiuta il protagonista a cambiare idea e lo prepara ad affrontare la sfida.',
  },
  {
    index: 5,
    title: 'Il superamento della prima soglia',
    guidance:
      'Il protagonista accetta il percorso e varca la soglia verso il mondo straordinario, prendendosi le sue responsabilità.',
  },
  {
    index: 6,
    title: 'Prove, alleati e nemici',
    guidance:
      'Il protagonista scopre chi sono i suoi alleati e chi i suoi avversari, e affronta le prime prove del mondo straordinario.',
  },
  {
    index: 7,
    title: 'L’avvicinamento alla caverna più profonda',
    guidance:
      'Il protagonista si avvicina al cuore della sfida e prepara una strategia insieme ai suoi alleati.',
  },
  {
    index: 8,
    title: 'La prova centrale',
    guidance:
      'Primo grande scontro: il protagonista esce sconfitto, ma la battuta d’arresto lo renderà più forte e più umano.',
  },
  {
    index: 9,
    title: 'La ricompensa',
    guidance:
      'Dalla sconfitta nasce un beneficio: un dono del mentore, uno strumento speciale o una conoscenza fondamentale per la battaglia finale.',
  },
  {
    index: 10,
    title: 'La via del ritorno',
    guidance:
      'Il protagonista sente il desiderio di tornare a casa e di ristabilire l’ordine: la sfida finale diventa inevitabile.',
  },
  {
    index: 11,
    title: 'La resurrezione',
    guidance:
      'Il protagonista dimostra di essere cambiato: affronta una prova estrema, una metaforica morte e rinascita, e ne esce trasformato.',
  },
  {
    index: 12,
    title: 'Il ritorno con l’elisir',
    guidance:
      'Il protagonista torna al mondo ordinario portando con sé l’elisir: una lezione imparata, un oggetto simbolico o una ricompensa della sfida.',
  },
]

export const TOTAL_CHAPTERS = HERO_JOURNEY.length

export const AGE_STYLES: Record<AgeGroup, AgeStyle> = {
  '3-5': {
    group: '3-5',
    label: '3-5 anni',
    styleGuide:
      'Frasi brevi e semplici, lessico basicissimo, tono caldo e rassicurante. Ogni concetto è espresso con parole concrete che un bambino piccolo capisce.',
  },
  '6-9': {
    group: '6-9',
    label: '6-9 anni',
    styleGuide:
      'Struttura sintattica più ricca, con elementi di mistero e relazioni causa-effetto. Lessico accessibile ma stimolante.',
  },
  '10+': {
    group: '10+',
    label: '10+ anni',
    styleGuide:
      'Vocabolario articolato, sfumature emotive e dilemmi. Struttura narrativa più matura, mantenendo una lettura scorrevole.',
  },
}

const GUARDRAILS = `
Regole imprescindibili:
- Usa un linguaggio inclusivo.
- Non usare mai linguaggio volgare.
- Non fare mai allusioni sessuali.
- Usa un lessico adatto alla fascia d'età indicata.`

export function buildTitleMessages(
  ageGroup: AgeGroup,
  theme: string,
): ChatMessage[] {
  const style = AGE_STYLES[ageGroup]
  const themeText =
    theme.trim().length > 0
      ? `L'utente ha chiesto una storia su: "${theme.trim()}"`
      : "L'utente non ha indicato un tema: inventa tu liberamente un tema adatto alla fascia d'età."
  return [
    {
      role: 'system',
      content: `Sei Raccontastorie, un narratore di favole per bambini in italiano.${GUARDRAILS}

Rispondi SEMPRE e SOLO con un oggetto JSON valido nel formato:
{ "title": "..." }

Il titolo deve essere ONIRICO E AMPIO, mai troppo specifico: "L'avventura di ..." o "Il segreto di ..." seguito da un nome evocativo. Massimo 7 parole. Niente emoji, niente virgolette dentro il titolo. Adatto alla fascia ${style.label}.`,
    },
    {
      role: 'user',
      content: `${themeText}

Inventa il titolo onirico della storia.`,
    },
  ]
}

export type ChapterRequest = {
  ageGroup: AgeGroup
  title: string
  theme: string
  chapter: HeroChapter
  previousChapters: { title: string; content: string }[]
}

export function buildChapterMessages(
  req: ChapterRequest,
): ChatMessage[] {
  const style = AGE_STYLES[req.ageGroup]
  const memory =
    req.previousChapters.length === 0
      ? 'Questo è il primo capitolo.'
      : `CAPITOLI GIÀ RACCONTATI (riassunto della storia fin qui):\n${req.previousChapters
          .map((c) => `--- ${c.title} ---\n${c.content}`)
          .join('\n\n')}`
  return [
    {
      role: 'system',
      content: `Sei Raccontastorie, un narratore di favole per bambini in italiano.${GUARDRAILS}

Stile per la fascia ${style.label}: ${style.styleGuide}

Scrivi UN SOLO capitolo della favola "${req.title}".
Capitolo ${req.chapter.index} di ${TOTAL_CHAPTERS}: "${req.chapter.title}".
Cosa deve accadere in questo capitolo: ${req.chapter.guidance}

Requisiti del capitolo:
- Minimo 300 parole, massimo 500 parole.
- Sei coerente con i capitoli precedenti e con l'arco completo del viaggio dell'eroe (i capitoli futuri devono poter continuare naturalmente).
- Termina il capitolo in modo che invogli ad ascoltare il prossimo.
- Rispondi SOLO con il testo del capitolo, senza titoli, senza numerazione, senza premesse. Nessun formato JSON.`,
    },
    {
      role: 'user',
      content: `${memory}

Racconta ora il capitolo ${req.chapter.index}: "${req.chapter.title}".`,
    },
  ]
}

export function parseTitle(raw: string): { ok: true; title: string } | { ok: false } {
  const match = raw.match(/\{[\s\S]*"title"[\s\S]*\}/)
  if (!match) return { ok: false }
  try {
    const parsed = JSON.parse(match[0]) as { title?: string }
    const title = (parsed.title ?? '').trim()
    if (title.length === 0) return { ok: false }
    return { ok: true, title }
  } catch {
    return { ok: false }
  }
}

export function parseChapter(raw: string): { ok: true; content: string } | { ok: false } {
  const content = raw.trim()
  if (content.length < 200) return { ok: false }
  return { ok: true, content }
}
