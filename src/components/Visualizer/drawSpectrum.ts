export interface DrawSpectrumOptions {
  ctx: CanvasRenderingContext2D
  data: Uint8Array
  width: number
  height: number
  accent: string
  accent2: string
  time: number
  isActive: boolean
}

const BAR_COUNT = 48
const GAP = 2

export function drawSpectrum(opts: DrawSpectrumOptions): void {
  const { ctx, data, width, height, accent, accent2, time, isActive } = opts

  ctx.clearRect(0, 0, width, height)
  if (width <= 0 || height <= 0) return

  const barWidth = (width - GAP * (BAR_COUNT - 1)) / BAR_COUNT
  if (barWidth <= 0) return

  const centerY = height / 2
  const supportsRoundRect = typeof ctx.roundRect === 'function'

  for (let i = 0; i < BAR_COUNT; i++) {
    let v: number
    if (isActive && data.length > 0) {
      // Escala logarítmica: evita que los graves monopolicen el espectro.
      const idx = Math.floor(Math.pow(i / BAR_COUNT, 2) * data.length)
      v = data[idx] / 255
    } else {
      // Idle: onda senoidal suave, altura ~15%, cada barra corrida en fase.
      v = (Math.sin(time / 500 + i * 0.3) * 0.5 + 0.5) * 0.15
    }

    const barHeight = v * height
    if (barHeight <= 0) continue

    const x = i * (barWidth + GAP)
    const y = centerY - barHeight / 2

    const grad = ctx.createLinearGradient(0, y, 0, y + barHeight)
    grad.addColorStop(0, accent2)
    grad.addColorStop(0.5, accent)
    grad.addColorStop(1, accent2)
    ctx.fillStyle = grad

    if (supportsRoundRect) {
      ctx.beginPath()
      ctx.roundRect(x, y, barWidth, barHeight, barWidth / 2)
      ctx.fill()
    } else {
      // Fallback para browsers viejos sin Path2D.roundRect.
      ctx.fillRect(x, y, barWidth, barHeight)
    }
  }
}
