export type AgeGroup = '3-5' | '6-9' | '10+'

export type ChoiceMode = 'closed' | 'hybrid' | 'open'

export type StoryOption = {
  id: string
  label: string
  keywords: string[]
}

export type StoryBeat = {
  narration: string
  choicePrompt: string
  options: StoryOption[]
  isStoryEnd: boolean
}

export type StoryPhaseId = string

export type StoryPhase = {
  id: StoryPhaseId
  name: string
  description: string
}

export type AgeProfile = {
  group: AgeGroup
  label: string
  totalSteps: number
  phases: StoryPhase[]
  styleGuide: string
  maxSentenceWords: number
  narrationMaxWords: number
  choiceMode: ChoiceMode
}

export type StoryChoiceMemory = {
  step: number
  phase: string
  chosenLabel: string
  transcript: string
}

export type StoryEngineConfig = {
  ageGroup: AgeGroup
  storyTheme: string
}
