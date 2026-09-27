import type { AgeGroup, AgeProfile, StoryPhase } from '../types/story'

function phase(id: string, name: string, description: string): StoryPhase {
  return { id, name, description }
}

export const AGE_PROFILES: Record<AgeGroup, AgeProfile> = {
  '3-5': {
    group: '3-5',
    label: '3-5 anni',
    totalSteps: 3,
    phases: [
      phase(
        'situazione_iniziale',
        'Situazione iniziale',
        'Presenta il protagonista e la mancanza o il danno che dà avvio alla storia.',
      ),
      phase(
        'donatore_magico',
        'Donatore e strumento magico',
        'Il protagonista incontra un donatore e riceve uno strumento magico.',
      ),
      phase(
        'lieto_fine',
        'Prova superata e festa',
        'La prova viene superata e la storia si chiude con un lieto fine.',
      ),
    ],
    styleGuide:
      'Parole semplici e frasi cortissime (meno di 15 parole per frase). Tono rassicurante, dolce e allegro. Niente momenti paurosi. Le scelte sono sempre due, chiare e polarizzate (per esempio: la porta rossa o la porta blu).',
    maxSentenceWords: 15,
    narrationMaxWords: 50,
    closedChoices: true,
  },
  '6-9': {
    group: '6-9',
    label: '6-9 anni',
    totalSteps: 5,
    phases: [
      phase(
        'mondo_ordinario',
        'Mondo ordinario e chiamata',
        'Il mondo ordinario del protagonista e la chiamata all’avventura.',
      ),
      phase(
        'varco_aiutante',
        'Varco della soglia e aiutante',
        'Il protagonista varca la soglia e incontra un aiutante magico.',
      ),
      phase(
        'prove_antagonista',
        'Prove e antagonista',
        'Le prime prove e l’apparizione dell’antagonista.',
      ),
      phase(
        'climax',
        'Climax',
        'Lo scontro risolutivo con l’antagonista.',
      ),
      phase(
        'ritorno_elisir',
        'Ritorno con l’elisir',
        'Il ritorno con la ricompensa e la lezione appresa.',
      ),
    ],
    styleGuide:
      'Struttura sintattica più ricca, con elementi di mistero e relazioni causa-effetto. Le opzioni sono due o tre, descrittive ma facili da capire.',
    maxSentenceWords: 20,
    narrationMaxWords: 70,
    closedChoices: false,
  },
  '10+': {
    group: '10+',
    label: '10+ anni',
    totalSteps: 7,
    phases: [
      phase(
        'mondo_chiamata',
        'Mondo ordinario e chiamata',
        'Il mondo ordinario, la chiamata all’avventura e il rifiuto con la spinta.',
      ),
      phase(
        'mentore_varco',
        'Mentore e varco',
        'L’incontro con il mentore e il varco della soglia.',
      ),
      phase(
        'prove_alleati',
        'Prove, alleati e nemici',
        'Le prove, gli alleati e i nemici del nuovo mondo.',
      ),
      phase(
        'caverna',
        'Avvicinamento alla caverna',
        'L’avvicinamento alla caverna più recondita.',
      ),
      phase(
        'calvario',
        'Calvario',
        'La crisi profonda, il momento più difficile.',
      ),
      phase(
        'resurrezione',
        'Resurrezione',
        'La resurrezione e il momento decisivo.',
      ),
      phase(
        'ritorno_trasformato',
        'Ritorno trasformato',
        'Il ritorno con il protagonista trasformato.',
      ),
    ],
    styleGuide:
      'Vocabolario articolato, sfumature emotive, dilemmi morali o strategici. Le scelte possono essere aperte o ibride: chiedi al bambino cosa decide di fare.',
    maxSentenceWords: 25,
    narrationMaxWords: 80,
    closedChoices: false,
  },
}
