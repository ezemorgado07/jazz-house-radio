export interface DrawVinylOptions {
  ctx: CanvasRenderingContext2D
  data: Uint8Array
  width: number
  height: number
  accent: string
  accent2: string
  rotation: number
  isActive: boolean
}

export function drawVinyl(opts: DrawVinylOptions): void {
  const { ctx, data, width, height, accent, accent2, rotation, isActive } = opts

  ctx.clearRect(0, 0, width, height)
  if (width <= 0 || height <= 0) return

  const cx = width / 2
  const cy = height / 2
  const baseRadius = Math.min(width, height) * 0.4

  // Bass detection: promedio de los primeros 12 bins (los graves). Al 60 FPS
  // sin suavizado se ve "nervioso"; el AnalyserNode ya trae smoothingTimeConstant
  // en su default (0.8), así que el dato llega lo bastante filtrado.
  const bassBins = Math.min(12, data.length)
  let bassSum = 0
  for (let i = 0; i < bassBins; i++) bassSum += data[i]
  const bassAvg = bassBins > 0 ? bassSum / bassBins / 255 : 0

  // En idle, "breathing" suave derivado de la rotación para no agregar otra
  // referencia de tiempo; oscila entre ~0.10 y ~0.25.
  const idleBreath = (Math.sin(rotation * 2) * 0.5 + 0.5) * 0.15 + 0.1
  const bass = isActive ? bassAvg : idleBreath

  // 1. HALO externo pulsante (fuera del save/restore porque no rota)
  const glowRadius = baseRadius + 15 + bass * 40
  const halo = ctx.createRadialGradient(
    cx,
    cy,
    baseRadius * 0.9,
    cx,
    cy,
    glowRadius,
  )
  halo.addColorStop(0, accent + 'aa')
  halo.addColorStop(0.5, accent + '44')
  halo.addColorStop(1, 'transparent')
  ctx.fillStyle = halo
  ctx.beginPath()
  ctx.arc(cx, cy, glowRadius, 0, Math.PI * 2)
  ctx.fill()

  // 2. Disco + grooves + label (todo rotado)
  ctx.save()
  ctx.translate(cx, cy)
  ctx.rotate(rotation)

  ctx.fillStyle = '#0a0a0a'
  ctx.beginPath()
  ctx.arc(0, 0, baseRadius, 0, Math.PI * 2)
  ctx.fill()

  // Grooves: anillos finos apenas visibles, entre el borde del label y el del disco
  ctx.strokeStyle = 'rgba(255,255,255,0.04)'
  ctx.lineWidth = 1
  const grooveCount = 18
  for (let i = 1; i <= grooveCount; i++) {
    const r = baseRadius * (0.35 + (i / grooveCount) * 0.6)
    ctx.beginPath()
    ctx.arc(0, 0, r, 0, Math.PI * 2)
    ctx.stroke()
  }

  const labelRadius = baseRadius * 0.3
  ctx.fillStyle = accent
  ctx.beginPath()
  ctx.arc(0, 0, labelRadius, 0, Math.PI * 2)
  ctx.fill()

  // Marca radial: sin esta línea la rotación es imperceptible en un disco uniforme.
  ctx.strokeStyle = accent2 + '66'
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(labelRadius + 2, 0)
  ctx.lineTo(baseRadius - 4, 0)
  ctx.stroke()

  // Spindle hole
  ctx.fillStyle = '#0a0a0a'
  ctx.beginPath()
  ctx.arc(0, 0, 4, 0, Math.PI * 2)
  ctx.fill()

  ctx.restore()
}
