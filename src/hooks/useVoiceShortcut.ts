import { useEffect, useRef } from 'react'

type UseVoiceShortcutOptions = {
  enabled: boolean
  onToggle: () => void
}

export function useVoiceShortcut({
  enabled,
  onToggle,
}: UseVoiceShortcutOptions): void {
  const pressingRef = useRef(false)

  useEffect(() => {
    if (!enabled) return

    const isTypingTarget = (target: EventTarget | null): boolean => {
      const el = target as HTMLElement | null
      if (!el) return false
      return (
        el.tagName === 'INPUT' ||
        el.tagName === 'TEXTAREA' ||
        el.isContentEditable
      )
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== ' ' || event.repeat) return
      if (isTypingTarget(event.target)) return
      event.preventDefault()
      if (pressingRef.current) return
      pressingRef.current = true
      onToggle()
    }

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key !== ' ') return
      event.preventDefault()
      pressingRef.current = false
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [enabled, onToggle])
}
