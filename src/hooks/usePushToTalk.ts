import { useEffect, useRef } from 'react'

type UsePushToTalkOptions = {
  enabled: boolean
  onPressStart: () => void
  onPressEnd: () => void
}

export function usePushToTalk({
  enabled,
  onPressStart,
  onPressEnd,
}: UsePushToTalkOptions): void {
  const pressingRef = useRef(false)

  useEffect(() => {
    if (!enabled) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== ' ' || event.repeat) return
      const target = event.target as HTMLElement | null
      if (target && ['INPUT', 'TEXTAREA', 'BUTTON'].includes(target.tagName)) {
        if (target.tagName === 'BUTTON') return
        return
      }
      event.preventDefault()
      if (pressingRef.current) return
      pressingRef.current = true
      onPressStart()
    }
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key !== ' ') return
      event.preventDefault()
      if (!pressingRef.current) return
      pressingRef.current = false
      onPressEnd()
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [enabled, onPressStart, onPressEnd])
}
