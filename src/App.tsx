import { useCallback, useEffect, useRef, useState } from 'react'
import { LlmEngine } from './services/llmEngine'
import { OpenRouterEngine } from './services/openRouterEngine'
import {
  MODEL_OPTIONS,
  DEFAULT_MODEL_ID,
} from './services/modelConfig'
import {
  deleteModelFromCache,
  estimateCacheSize,
  formatBytes,
  isModelCached,
} from './services/modelCache'
import {
  AGE_STYLES,
  HERO_JOURNEY,
  TOTAL_CHAPTERS,
  buildChapterMessages,
  buildTitleMessages,
  parseChapter,
  parseTitle,
} from './services/storyEngine'
import { speechSynthesizer } from './services/speechSynthesizer'
import ModelOnboarding from './components/ModelOnboarding'
import type {
  AgeGroup,
  ChatMessage,
  EngineKind,
  LlmStatus,
} from './types/story'

type Screen =
  | 'onboarding'
  | 'age-selection'
  | 'theme'
  | 'story'

type Chapter = { title: string; content: string }

const THEME_PROMPT = 'Su cosa vorresti che ti raccontassi una storia?'
const QUICK_THEMES = ['dinosauri', 'principesse', 'spazio', 'scegli tu']

const FIRST_TOKEN_TIMEOUT_MS = 120000

const GENERIC_ERROR_MESSAGE =
  'Scusa, mi sono distratto un attimo. Riprova con il pulsante.'

const GENERATION_STUCK_MESSAGE =
  'Scusa, proprio non riesco a continuare adesso. Premi Nuova storia per ripartire.'

const MAX_CONSECUTIVE_GENERATION_ERRORS = 3

export default function App() {
  const [screen, setScreen] = useState<Screen>('onboarding')
  const [llmStatus, setLlmStatus] = useState<LlmStatus>({ phase: 'idle' })
  const [engineKind, setEngineKind] = useState<EngineKind>('webgpu')
  const [ageGroup, setAgeGroup] = useState<AgeGroup | null>(null)
  const [theme, setTheme] = useState('')
  const [storyTitle, setStoryTitle] = useState('')
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [currentChapter, setCurrentChapter] = useState<Chapter | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [generationError, setGenerationError] = useState('')
  const [cacheInfo, setCacheInfo] = useState<{
    modelId: string
    cached: boolean
    size: number
  } | null>(null)
  const [cacheBusy, setCacheBusy] = useState(false)

  const llmEngineRef = useRef<LlmEngine | null>(null)
  const openRouterRef = useRef<OpenRouterEngine | null>(null)
  const engineKindRef = useRef<EngineKind>('webgpu')
  const modelIdRef = useRef(DEFAULT_MODEL_ID)
  const ageGroupRef = useRef<AgeGroup | null>(null)
  const themeRef = useRef('')
  const titleRef = useRef('')
  const chaptersRef = useRef<Chapter[]>([])
  const generationErrorRef = useRef(0)
  const abortRef = useRef(false)

  useEffect(() => {
    speechSynthesizer.init()
    return () => {
      speechSynthesizer.cancel()
      llmEngineRef.current?.destroyWorker()
      openRouterRef.current?.cancel()
    }
  }, [])

  const generateText = useCallback(
    async (messages: ChatMessage[]): Promise<string> => {
      if (engineKindRef.current === 'openrouter') {
        return openRouterRef.current!.generate(messages)
      }
      if (!llmEngineRef.current) throw new Error('no-engine')
      return llmEngineRef.current.generate(messages)
    },
    [],
  )

  const refreshCacheInfo = useCallback(async () => {
    for (const model of MODEL_OPTIONS) {
      const cached = await isModelCached(model.id)
      if (cached) {
        const size = await estimateCacheSize()
        setCacheInfo({ modelId: model.id, cached: true, size })
        return
      }
    }
    const size = await estimateCacheSize()
    setCacheInfo({ modelId: DEFAULT_MODEL_ID, cached: false, size })
  }, [])

  useEffect(() => {
    if (engineKind === 'webgpu') {
      void refreshCacheInfo()
    }
  }, [engineKind, refreshCacheInfo])

  const speakChapter = useCallback((chapter: Chapter) => {
    speechSynthesizer.cancel()
    setIsSpeaking(true)
    speechSynthesizer.speakSafely(chapter.content, {
      onStart: () => setIsSpeaking(true),
      onEnd: () => setIsSpeaking(false),
    })
  }, [])

  async function generateNextChapter(): Promise<void> {
    const group = ageGroupRef.current
    if (!group || isGenerating) return
    const nextIndex = chaptersRef.current.length
    if (nextIndex >= TOTAL_CHAPTERS) return
    const chapter = HERO_JOURNEY[nextIndex]
    setIsGenerating(true)
    setGenerationError('')
    abortRef.current = false
    const watchdog = window.setTimeout(() => {
      if (!abortRef.current) {
        openRouterRef.current?.cancel()
        llmEngineRef.current?.destroyWorker()
      }
    }, FIRST_TOKEN_TIMEOUT_MS)
    try {
      const messages = buildChapterMessages({
        ageGroup: group,
        title: titleRef.current,
        theme: themeRef.current,
        chapter,
        previousChapters: chaptersRef.current,
      })
      const raw = await generateText(messages)
      window.clearTimeout(watchdog)
      if (abortRef.current) return
      const parsed = parseChapter(raw)
      if (!parsed.ok) {
        reportGenerationError()
        return
      }
      generationErrorRef.current = 0
      const newChapter = { title: chapter.title, content: parsed.content }
      chaptersRef.current = [...chaptersRef.current, newChapter]
      setChapters(chaptersRef.current)
      setCurrentChapter(newChapter)
      speakChapter(newChapter)
    } catch {
      window.clearTimeout(watchdog)
      if (!abortRef.current) reportGenerationError()
    } finally {
      setIsGenerating(false)
    }
  }

  function reportGenerationError() {
    generationErrorRef.current += 1
    if (generationErrorRef.current >= MAX_CONSECUTIVE_GENERATION_ERRORS) {
      generationErrorRef.current = 0
      setGenerationError(GENERATION_STUCK_MESSAGE)
      speechSynthesizer.speakSafely(GENERATION_STUCK_MESSAGE)
      return
    }
    setGenerationError(GENERIC_ERROR_MESSAGE)
    speechSynthesizer.speakSafely(GENERIC_ERROR_MESSAGE)
  }

  async function generateTitleStory(): Promise<void> {
    const group = ageGroupRef.current
    if (!group || isGenerating) return
    setIsGenerating(true)
    setGenerationError('')
    abortRef.current = false
    try {
      const raw = await generateText(buildTitleMessages(group, themeRef.current))
      if (abortRef.current) return
      const parsed = parseTitle(raw)
      if (!parsed.ok) {
        reportGenerationError()
        return
      }
      generationErrorRef.current = 0
      titleRef.current = parsed.title
      setStoryTitle(parsed.title)
      setScreen('story')
      speechSynthesizer.speakSafely(
        `Che bello! La storia si intitola: ${parsed.title}. Ascolta...`,
        { onEnd: () => void generateNextChapter() },
      )
    } catch {
      if (!abortRef.current) reportGenerationError()
    } finally {
      setIsGenerating(false)
    }
  }

  const handleStartModelLoad = useCallback((modelId: string) => {
    engineKindRef.current = 'webgpu'
    modelIdRef.current = modelId
    setEngineKind('webgpu')
    setLlmStatus({ phase: 'loading', progress: 0, text: '' })
    const engine = new LlmEngine()
    llmEngineRef.current = engine
    engine.load((status) => {
      setLlmStatus(status)
      if (status.phase === 'ready') setScreen('age-selection')
    }, modelId)
  }, [])

  const handleStartOpenRouter = useCallback((apiKey: string) => {
    engineKindRef.current = 'openrouter'
    setEngineKind('openrouter')
    openRouterRef.current = new OpenRouterEngine({ apiKey })
    setLlmStatus({ phase: 'ready' })
    setScreen('age-selection')
  }, [])

  const handleAgeSelect = useCallback((group: AgeGroup) => {
    ageGroupRef.current = group
    setAgeGroup(group)
    setScreen('theme')
  }, [])

  const handleThemeSelect = useCallback(
    (selected: string) => {
      const chosen =
        selected === 'scegli tu' ? '' : selected
      themeRef.current = chosen
      setTheme(chosen)
      setScreen('story')
      titleRef.current = ''
      chaptersRef.current = []
      setChapters([])
      setCurrentChapter(null)
      void generateTitleStory()
    },
    [],
  )

  const handleRestart = useCallback(() => {
    abortRef.current = true
    openRouterRef.current?.cancel()
    speechSynthesizer.cancel()
    setIsSpeaking(false)
    setIsGenerating(false)
    generationErrorRef.current = 0
    titleRef.current = ''
    chaptersRef.current = []
    themeRef.current = ''
    setStoryTitle('')
    setChapters([])
    setCurrentChapter(null)
    setGenerationError('')
    setScreen('age-selection')
  }, [])

  const handleDeleteCache = useCallback(async () => {
    setCacheBusy(true)
    const cached = MODEL_OPTIONS.map((m) => m.id)
    for (const modelId of cached) {
      await deleteModelFromCache(modelId)
    }
    await refreshCacheInfo()
    setCacheBusy(false)
  }, [refreshCacheInfo])

  const chapterIndex = chapters.length
  const isLastChapter = chapterIndex >= TOTAL_CHAPTERS

  return (
    <main className="flex min-h-dvh flex-col items-center justify-between gap-6 px-4 py-6">
      <header className="flex w-full max-w-xl flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-bold text-slate-100">Raccontastorie</h1>
        <p className="text-sm text-slate-400">
          Il tuo narratore di favole interattivo
        </p>
        {ageGroup && screen !== 'onboarding' && (
          <p className="text-xs text-slate-500">
            Fascia d'età: {AGE_STYLES[ageGroup].label}
            {theme.length > 0 ? ` · tema: ${theme}` : ''}
          </p>
        )}
        {cacheInfo && engineKind === 'webgpu' && (
          <div className="mt-2 flex w-full flex-col items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/60 px-4 py-3">
            <p className="text-xs text-slate-400">
              Modello locale{' '}
              {cacheInfo.cached ? 'in cache' : 'non scaricato'} —{' '}
              {formatBytes(cacheInfo.size)} usati dal browser
            </p>
            <button
              type="button"
              onClick={handleDeleteCache}
              disabled={cacheBusy || !cacheInfo.cached}
              className="rounded-full border border-red-400/40 px-4 py-1 text-xs text-red-300 transition hover:border-red-400 hover:text-red-200 disabled:opacity-40"
            >
              {cacheBusy
                ? 'Elimino...'
                : cacheInfo.cached
                  ? 'Elimina modello per liberare spazio'
                  : 'Nessun modello in cache'}
            </button>
          </div>
        )}
      </header>

      <section className="flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-6 text-center">
        {screen === 'onboarding' && (
          <ModelOnboarding
            status={llmStatus}
            onStart={handleStartModelLoad}
            onOpenRouterStart={handleStartOpenRouter}
          />
        )}

        {screen === 'age-selection' && (
          <div className="flex w-full max-w-md flex-col items-center gap-6">
            <p className="text-lg text-slate-200">
              Chi ascolterà la favola?
            </p>
            <div className="flex w-full flex-col gap-3">
              {(Object.keys(AGE_STYLES) as AgeGroup[]).map((group) => (
                <button
                  key={group}
                  type="button"
                  onClick={() => handleAgeSelect(group)}
                  className="rounded-2xl border border-slate-600 bg-slate-800/80 px-6 py-4 text-lg font-semibold text-slate-100 transition hover:border-emerald-400/60 hover:bg-slate-800 active:scale-[0.99]"
                >
                  {AGE_STYLES[group].label}
                </button>
              ))}
            </div>
          </div>
        )}

        {screen === 'theme' && (
          <div className="flex w-full max-w-md flex-col items-center gap-6">
            <p className="text-lg text-slate-200">{THEME_PROMPT}</p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {QUICK_THEMES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => handleThemeSelect(t)}
                  className="rounded-full border border-slate-600 bg-slate-800/80 px-5 py-2 text-sm text-slate-100 transition hover:border-emerald-400/60 hover:bg-slate-800 active:scale-[0.98]"
                >
                  {t}
                </button>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const value = new FormData(e.currentTarget).get('theme')
                if (typeof value === 'string' && value.trim().length > 0) {
                  handleThemeSelect(value.trim())
                }
              }}
              className="flex w-full max-w-sm items-center gap-2"
            >
              <input
                name="theme"
                type="text"
                placeholder="oppure scrivi qui il tuo argomento..."
                className="w-full rounded-full border border-slate-600 bg-slate-900 px-4 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-400/60 focus:outline-none"
              />
              <button
                type="submit"
                className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
              >
                Vai
              </button>
            </form>
          </div>
        )}

        {screen === 'story' && (
          <div className="flex w-full max-w-2xl flex-col items-center gap-5">
            {storyTitle.length > 0 && (
              <p className="text-center text-xl font-bold text-indigo-300">
                «{storyTitle}»
              </p>
            )}
            {chapterIndex > 0 && (
              <p className="text-xs uppercase tracking-widest text-slate-500">
                Capitolo {chapterIndex} di {TOTAL_CHAPTERS}
                {isLastChapter ? ' — La favola è completa!' : ''}
              </p>
            )}

            {generationError.length > 0 && (
              <p
                className="max-w-md rounded-lg border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-200"
                role="alert"
              >
                {generationError}
              </p>
            )}

            {isGenerating && (
              <p className="animate-pulse text-slate-400">Sto pensando...</p>
            )}

            {currentChapter && (
              <article className="prose prose-invert max-w-none">
                <h2 className="text-lg font-semibold text-slate-200">
                  {currentChapter.title}
                </h2>
                <p className="whitespace-pre-wrap text-left text-base leading-relaxed text-slate-300">
                  {currentChapter.content}
                </p>
              </article>
            )}

            {isGenerating && currentChapter === null && storyTitle.length === 0 && (
              <p className="text-sm text-slate-500">
                Sto inventando il titolo...
              </p>
            )}

            <div className="flex flex-wrap items-center justify-center gap-3">
              {!isLastChapter && !isGenerating && (
                <button
                  type="button"
                  onClick={() => void generateNextChapter()}
                  disabled={isSpeaking}
                  className="rounded-full bg-emerald-500 px-6 py-3 font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-40"
                >
                  {chapterIndex === 0
                    ? 'Inizia la favola'
                    : 'Prossimo capitolo'}
                </button>
              )}
              {isSpeaking && (
                <button
                  type="button"
                  onClick={() => {
                    speechSynthesizer.cancel()
                    setIsSpeaking(false)
                  }}
                  className="rounded-full border border-slate-600 px-6 py-3 text-slate-200 transition hover:border-indigo-400/60"
                >
                  ⏸ Ferma la voce
                </button>
              )}
              {isLastChapter && (
                <p className="text-emerald-300">
                  La favola è finita! 🎉
                </p>
              )}
            </div>

            {chapters.length > 1 && (
              <details className="w-full max-w-xl text-left">
                <summary className="cursor-pointer text-sm text-slate-400">
                  Riascolta un capitolo precedente
                </summary>
                <ul className="mt-3 flex flex-col gap-2">
                  {chapters.map((c, i) => (
                    <li key={i}>
                      <button
                        type="button"
                        onClick={() => {
                          setCurrentChapter(c)
                          speakChapter(c)
                        }}
                        className="text-sm text-slate-300 underline decoration-slate-600 underline-offset-4 transition hover:text-slate-100"
                      >
                        {i + 1}. {c.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </section>

      <footer className="flex w-full max-w-xl items-center justify-between text-xs text-slate-600">
        <span>
          {engineKind === 'webgpu'
            ? 'Funziona nel tuo browser, i dati non lasciano il dispositivo.'
            : 'Motore OpenRouter con la tua chiave API.'}
        </span>
        {screen !== 'onboarding' && screen !== 'age-selection' && (
          <button
            type="button"
            onClick={handleRestart}
            className="rounded-full border border-slate-700 px-4 py-1 text-slate-400 transition hover:border-indigo-400/60 hover:text-slate-200"
          >
            ✨ Nuova favola
          </button>
        )}
      </footer>
    </main>
  )
}
