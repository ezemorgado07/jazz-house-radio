import { useEffect, useRef, type RefObject } from 'react'
import { drawSpectrum } from './drawSpectrum'

interface VisualizerProps {
  analyserRef: RefObject<AnalyserNode | null>
  isActive: boolean
}

export function Visualizer({ analyserRef, isActive }: VisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)
  const dataRef = useRef<Uint8Array<ArrayBuffer> | null>(null)

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

      const analyser = analyserRef.current
      if (!analyser) {
        // Pre-primer-Play: no hay grafo todavía, animamos idle para que
        // el panel esté "vivo" en vez de ser un rectángulo negro.
        drawSpectrum({
          ctx,
          data: dataRef.current ?? new Uint8Array(0),
          width: cssWidth,
          height: cssHeight,
          accent,
          accent2,
          time,
          isActive: false,
        })
        return
      }

      if (
        !dataRef.current ||
        dataRef.current.length !== analyser.frequencyBinCount
      ) {
        dataRef.current = new Uint8Array(analyser.frequencyBinCount)
      }
      analyser.getByteFrequencyData(dataRef.current)

      drawSpectrum({
        ctx,
        data: dataRef.current,
        width: cssWidth,
        height: cssHeight,
        accent,
        accent2,
        time,
        isActive,
      })
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
