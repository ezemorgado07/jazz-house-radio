import { useEffect, useRef } from 'react'

export interface ShortcutHandlers {
  onTogglePlay: () => void
  onToggleMute: () => void
  onNext: () => void
  onPrev: () => void
}

// Mirror ref para handlers: el useEffect se suscribe UNA sola vez (deps []) y
// siempre lee la versión fresca vía handlersRef.current. Si pasáramos handlers
// como dep, cualquier re-render de App re-suscribiría el listener global.
export function useKeyboardShortcuts(handlers: ShortcutHandlers): void {
  const handlersRef = useRef(handlers)

  useEffect(() => {
    handlersRef.current = handlers
  }, [handlers])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // No interferir con inputs: los sliders usan ArrowLeft/Right para
      // precisión fina, y un textarea podría venir en el futuro.
      const target = e.target as HTMLElement | null
      if (target) {
        const tag = target.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
          return
        }
      }

      // Match por code (no key) para que funcione en layouts no-QWERTY.
      switch (e.code) {
        case 'Space':
          // Sin preventDefault, Space scrollea la página.
          e.preventDefault()
          handlersRef.current.onTogglePlay()
          break
        case 'KeyM':
          handlersRef.current.onToggleMute()
          break
        case 'ArrowLeft':
          handlersRef.current.onPrev()
          break
        case 'ArrowRight':
          handlersRef.current.onNext()
          break
      }
    }

    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [])
}
