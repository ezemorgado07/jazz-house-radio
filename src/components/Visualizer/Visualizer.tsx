import { useEffect, useRef, type RefObject } from 'react'
import { drawSpectrum } from './drawSpectrum'
import { drawVinyl } from './drawVinyl'

export type VisualizerMode = 'spectrum' | 'vinyl'

interface VisualizerProps {
  analyserRef: RefObject<AnalyserNode | null>
  isActive: boolean
  mode: VisualizerMode
}

export function Visualizer({ analyserRef, isActive, mode }: VisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)
  const dataRef = useRef<Uint8Array<ArrayBuffer> | null>(null)
  // Mirror ref para mode: cambiar de modo no debe re-mount el loop del rAF
  // (eso resetea canvas state y mete un flash). El tick lee modeRef.current.
  const modeRef = useRef<VisualizerMode>(mode)
  const rotationRef = useRef(0)

  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let cssWidth = 0
    let cssHeight = 0

    const resize = () => {
      const rect = container.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      cssWidth = rect.width
      cssHeight = rect.height
      canvas.width = Math.max(1, Math.round(rect.width * dpr))
      canvas.height = Math.max(1, Math.round(rect.height * dpr))
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
      // setTransform en lugar de scale() para no acumular entre resizes:
      // asignar canvas.width/height ya resetea el state del context, pero
      // esto deja explícito que trabajamos en CSS pixels desde acá.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    resize()
    const ro = new ResizeObserver(() => resize())
    ro.observe(container)

    const initialAnalyser = analyserRef.current
    if (initialAnalyser) {
      dataRef.current = new Uint8Array(initialAnalyser.frequencyBinCount)
    }

    const tick = (time: number) => {
      rafRef.current = requestAnimationFrame(tick)

      const styles = getComputedStyle(canvas)
      const accent =
        styles.getPropertyValue('--accent').trim() || '#ffb347'
      const accent2 =
        styles.getPropertyValue('--accent-2').trim() || accent

      // Siempre acumulamos rotación, incluso cuando estamos en spectrum: así
      // al togglear a vinyl el disco no "aparece quieto" tras escuchar música.
      // 0.014 rad/frame ≈ 8 RPM a 60 FPS; idle a 0.003 ≈ 1.7 RPM (drift).
      rotationRef.current += isActive ? 0.014 : 0.003

      const analyser = analyserRef.current
      const data =
        analyser &&
        (!dataRef.current ||
          dataRef.current.length !== analyser.frequencyBinCount)
          ? (dataRef.current = new Uint8Array(analyser.frequencyBinCount))
          : dataRef.current
      if (analyser && data) {
        analyser.getByteFrequencyData(data)
      }

      const activeNow = Boolean(analyser) && isActive
      const effectiveData = data ?? new Uint8Array(0)

      if (modeRef.current === 'vinyl') {
        drawVinyl({
          ctx,
          data: effectiveData,
          width: cssWidth,
          height: cssHeight,
          accent,
          accent2,
          rotation: rotationRef.current,
          isActive: activeNow,
        })
      } else {
        drawSpectrum({
          ctx,
          data: effectiveData,
          width: cssWidth,
          height: cssHeight,
          accent,
          accent2,
          time,
          isActive: activeNow,
        })
      }
    }

    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      ro.disconnect()
    }
  }, [analyserRef, isActive])

  return (
    <div
      ref={containerRef}
      className="relative h-40 w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]/40"
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  )
}
