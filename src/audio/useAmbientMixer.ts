import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type {
  AmbientChannel,
  AmbientChannelId,
  AmbientMixer,
} from '../types'
import {
  generateBrownNoiseBuffer,
  generatePinkNoiseBuffer,
} from './noise'

const CHANNEL_DEFAULTS: AmbientChannel[] = [
  { id: 'rain', label: 'Rain', volume: 0 },
  { id: 'fireplace', label: 'Fireplace', volume: 0 },
  { id: 'coffee', label: 'Café murmur', volume: 0 },
]

const BUFFER_SECONDS = 10

type UserGainMap = Record<AmbientChannelId, GainNode | null>

const emptyUserGains = (): UserGainMap => ({
  rain: null,
  fireplace: null,
  coffee: null,
})

export function useAmbientMixer(
  contextRef: RefObject<AudioContext | null>,
  masterGainRef: RefObject<GainNode | null>,
  ensureReady: () => Promise<void>,
): AmbientMixer {
  const [channels, setChannels] = useState<AmbientChannel[]>(CHANNEL_DEFAULTS)

  // Centralizamos tracking: todo lo start-able a allSourcesRef, todo lo
  // conectable a allNodesRef. Los userGain por canal van en un map para que
  // setChannelVolume los encuentre por id. Los timers de los schedulers van
  // en sus propios refs para poder cancelarlos exactamente en el cleanup.
  const allSourcesRef = useRef<AudioScheduledSourceNode[]>([])
  const allNodesRef = useRef<AudioNode[]>([])
  const userGainsRef = useRef<UserGainMap>(emptyUserGains())
  const thunderTimerRef = useRef<number | null>(null)
  const fireplaceCrackTimerRef = useRef<number | null>(null)
  const coffeeSyllableTimersRef = useRef<Array<number | null>>([
    null,
    null,
    null,
  ])
  const isInitializedRef = useRef(false)

  const buildChannels = useCallback(async (): Promise<void> => {
    if (isInitializedRef.current) return
    isInitializedRef.current = true

    await ensureReady()
    const ctx = contextRef.current
    const master = masterGainRef.current
    if (!ctx || !master) {
      isInitializedRef.current = false
      return
    }

    const sources: AudioScheduledSourceNode[] = []
    const nodes: AudioNode[] = []

    // ============ RAIN ============
    // pink noise → highpass → modGain → userGain → master
    // LFO 0.02Hz modula modGain. Thunder scheduler cada 12–18s.
    {
      const pinkBuf = generatePinkNoiseBuffer(ctx, BUFFER_SECONDS)
      const src = ctx.createBufferSource()
      src.buffer = pinkBuf
      src.loop = true

      const filter = ctx.createBiquadFilter()
      filter.type = 'highpass'
      filter.frequency.value = 1000
      filter.Q.value = 0.7

      const modGain = ctx.createGain()
      modGain.gain.value = 1.0

      const userGain = ctx.createGain()
      userGain.gain.value = 0

      src.connect(filter)
      filter.connect(modGain)
      modGain.connect(userGain)
      userGain.connect(master)

      const lfo = ctx.createOscillator()
      lfo.type = 'sine'
      lfo.frequency.value = 0.02
      const lfoGain = ctx.createGain()
      lfoGain.gain.value = 0.4
      lfo.connect(lfoGain)
      lfoGain.connect(modGain.gain)

      src.start(0)
      lfo.start(0)

      sources.push(src, lfo)
      nodes.push(src, filter, modGain, userGain, lfo, lfoGain)
      userGainsRef.current.rain = userGain

      const scheduleThunder = (): void => {
        const delayMs = 12000 + Math.random() * 6000 // 12–18 s
        thunderTimerRef.current = window.setTimeout(() => {
          const now = ctx.currentTime
          const length = Math.floor(ctx.sampleRate * 3)
          const thunderBuf = ctx.createBuffer(1, length, ctx.sampleRate)
          const data = thunderBuf.getChannelData(0)
          for (let i = 0; i < length; i++) {
            data[i] = Math.random() * 2 - 1
          }

          const thunderSrc = ctx.createBufferSource()
          thunderSrc.buffer = thunderBuf
          const thunderFilter = ctx.createBiquadFilter()
          thunderFilter.type = 'lowpass'
          // 350Hz entra dentro del rango útil de parlantes chicos; Q=1.5
          // suena a retumbo en vez de a resonancia pura.
          thunderFilter.frequency.value = 350
          thunderFilter.Q.value = 1.5
          const envGain = ctx.createGain()
          envGain.gain.setValueAtTime(0, now)
          // Peak 1.0 compensa la energía perdida al filtrar tan abajo.
          envGain.gain.linearRampToValueAtTime(1.0, now + 0.1)
          envGain.gain.exponentialRampToValueAtTime(0.001, now + 3)

          thunderSrc.connect(thunderFilter)
          thunderFilter.connect(envGain)
          envGain.connect(userGain)

          thunderSrc.start(now)
          thunderSrc.stop(now + 3.5)

          scheduleThunder()
        }, delayMs)
      }
      scheduleThunder()
    }

    // ============ FIREPLACE ============
    // Fondo constante: pink → lowpass 800Hz Q=0.5 → baseGain(0.15) → userGain
    // Wood-crack scheduler cada 12–18s: burst corto de pink → bandpass
    // 2800Hz Q=4 → envelope rápido (ataque 5ms, decay 300ms) → userGain.
    {
      const pinkBuf = generatePinkNoiseBuffer(ctx, BUFFER_SECONDS)
      const src = ctx.createBufferSource()
      src.buffer = pinkBuf
      src.loop = true

      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 800
      filter.Q.value = 0.5

      const baseGain = ctx.createGain()
      baseGain.gain.value = 0.15

      const userGain = ctx.createGain()
      userGain.gain.value = 0

      src.connect(filter)
      filter.connect(baseGain)
      baseGain.connect(userGain)
      userGain.connect(master)

      src.start(0)
      sources.push(src)
      nodes.push(src, filter, baseGain, userGain)
      userGainsRef.current.fireplace = userGain

      const scheduleWoodCrack = (): void => {
        const delayMs = 3000 + Math.random() * 4000 // 3–7 s entre cracks
        fireplaceCrackTimerRef.current = window.setTimeout(() => {
          const now = ctx.currentTime
          // Pitch y volumen aleatorios por crack: suena a leña variada en
          // vez de a clicks idénticos repetidos.
          const freq = 2000 + Math.random() * 1500
          const peak = 0.4 + Math.random() * 0.3
          // Buffer fresco por crack: cada click suena distinto en vez de
          // repetir la misma forma de onda cada vez.
          const crackBuf = generatePinkNoiseBuffer(ctx, 0.15)
          const crackSrc = ctx.createBufferSource()
          crackSrc.buffer = crackBuf
          const crackFilter = ctx.createBiquadFilter()
          crackFilter.type = 'bandpass'
          crackFilter.frequency.value = freq
          crackFilter.Q.value = 4
          const envGain = ctx.createGain()
          envGain.gain.setValueAtTime(0.0001, now)
          envGain.gain.linearRampToValueAtTime(peak, now + 0.005)
          envGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3)

          crackSrc.connect(crackFilter)
          crackFilter.connect(envGain)
          envGain.connect(userGain)

          crackSrc.start(now)
          crackSrc.stop(now + 0.35)

          scheduleWoodCrack()
        }, delayMs)
      }
      scheduleWoodCrack()
    }

    // ============ COFFEE ============
    // Room tone: brown → bandpass 500Hz → baseGain(0.15) → userGain.
    // 3 voces basadas en sílabas: cada una tiene DOS bandpasses en paralelo
    // (F1 y F2, los dos primeros formantes vocales) desde una fuente pink
    // compartida. El scheduler elige una vocal del pool por sílaba y setea
    // los dos filtros a sus frecuencias — así el timbre cambia como lo
    // haría habla real en vez de ser un silbido modulado.
    {
      const brownBuf = generateBrownNoiseBuffer(ctx, BUFFER_SECONDS)
      const brownSrc = ctx.createBufferSource()
      brownSrc.buffer = brownBuf
      brownSrc.loop = true
      const brownFilter = ctx.createBiquadFilter()
      brownFilter.type = 'bandpass'
      brownFilter.frequency.value = 500
      brownFilter.Q.value = 0.9
      const baseGain = ctx.createGain()
      baseGain.gain.value = 0.15
      const userGain = ctx.createGain()
      userGain.gain.value = 0

      brownSrc.connect(brownFilter)
      brownFilter.connect(baseGain)
      baseGain.connect(userGain)
      userGain.connect(master)

      brownSrc.start(0)
      sources.push(brownSrc)
      nodes.push(brownSrc, brownFilter, baseGain, userGain)
      userGainsRef.current.coffee = userGain

      const sharedPink = generatePinkNoiseBuffer(ctx, BUFFER_SECONDS)
      // Cada vocal es [F1, F2] en Hz. 5 vocales por voz; el scheduler elige
      // una al azar por sílaba.
      const vowelPools: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
        // Voice 0 — grave/masculina
        [
          [700, 1100],
          [500, 900],
          [450, 850],
          [600, 1000],
          [550, 1150],
        ],
        // Voice 1 — media
        [
          [800, 1400],
          [550, 1300],
          [700, 1500],
          [500, 1800],
          [650, 1250],
        ],
        // Voice 2 — aguda/femenina
        [
          [1000, 1900],
          [650, 2200],
          [900, 2400],
          [700, 2100],
          [850, 2000],
        ],
      ]

      const voiceF1Filters: BiquadFilterNode[] = []
      const voiceF2Filters: BiquadFilterNode[] = []
      const voiceGains: GainNode[] = []

      for (let i = 0; i < 3; i++) {
        const vSrc = ctx.createBufferSource()
        vSrc.buffer = sharedPink
        vSrc.loop = true

        // Dos bandpasses en paralelo con Q más ancho (5): juntos arman el
        // par de formantes de una vocal. Q más alto antes suena a silbato.
        const f1Filter = ctx.createBiquadFilter()
        f1Filter.type = 'bandpass'
        f1Filter.Q.value = 5
        const f2Filter = ctx.createBiquadFilter()
        f2Filter.type = 'bandpass'
        f2Filter.Q.value = 5
        const [initF1, initF2] = vowelPools[i][0]
        f1Filter.frequency.value = initF1
        f2Filter.frequency.value = initF2

        const voiceGain = ctx.createGain()
        voiceGain.gain.value = 0.0001

        // El mismo src alimenta los dos filtros en paralelo; ambos filtros
        // suman en voiceGain (dos connect() al mismo destination).
        vSrc.connect(f1Filter)
        f1Filter.connect(voiceGain)
        vSrc.connect(f2Filter)
        f2Filter.connect(voiceGain)
        voiceGain.connect(userGain)

        vSrc.start(0)
        sources.push(vSrc)
        nodes.push(vSrc, f1Filter, f2Filter, voiceGain)
        voiceF1Filters.push(f1Filter)
        voiceF2Filters.push(f2Filter)
        voiceGains.push(voiceGain)
      }

      const scheduleNextSyllable = (voiceIdx: number): void => {
        const now = ctx.currentTime
        const pool = vowelPools[voiceIdx]
        const [f1, f2] = pool[Math.floor(Math.random() * pool.length)]
        voiceF1Filters[voiceIdx].frequency.setValueAtTime(f1, now)
        voiceF2Filters[voiceIdx].frequency.setValueAtTime(f2, now)

        const attack = 0.05
        const hold = 0.1 + Math.random() * 0.15
        const release = 0.08 + Math.random() * 0.05
        const silence = 0.2 + Math.random() * 0.5
        const peak = 0.4 + Math.random() * 0.2

        const voiceGain = voiceGains[voiceIdx]
        voiceGain.gain.setValueAtTime(0.0001, now)
        voiceGain.gain.exponentialRampToValueAtTime(peak, now + attack)
        voiceGain.gain.setValueAtTime(peak, now + attack + hold)
        voiceGain.gain.exponentialRampToValueAtTime(
          0.0001,
          now + attack + hold + release,
        )

        const totalMs = (attack + hold + release + silence) * 1000
        coffeeSyllableTimersRef.current[voiceIdx] = window.setTimeout(
          () => scheduleNextSyllable(voiceIdx),
          totalMs,
        )
      }

      // Desfase inicial un poco más amplio para que las primeras tres
      // sílabas no se apilen.
      const staggerDelays = [0, 220, 480]
      for (let i = 0; i < 3; i++) {
        coffeeSyllableTimersRef.current[i] = window.setTimeout(
          () => scheduleNextSyllable(i),
          staggerDelays[i],
        )
      }
    }

    allSourcesRef.current = sources
    allNodesRef.current = nodes
  }, [contextRef, masterGainRef, ensureReady])

  const setChannelVolume = useCallback(
    async (id: AmbientChannelId, volume: number): Promise<void> => {
      await buildChannels()
      const clamped = Math.max(0, Math.min(1, volume))
      setChannels((prev) =>
        prev.map((c) => (c.id === id ? { ...c, volume: clamped } : c)),
      )
      const ctx = contextRef.current
      const gain = userGainsRef.current[id]
      if (ctx && gain) {
        gain.gain.setTargetAtTime(clamped, ctx.currentTime, 0.03)
      }
    },
    [buildChannels, contextRef],
  )

  useEffect(() => {
    return () => {
      if (thunderTimerRef.current !== null) {
        window.clearTimeout(thunderTimerRef.current)
        thunderTimerRef.current = null
      }
      if (fireplaceCrackTimerRef.current !== null) {
        window.clearTimeout(fireplaceCrackTimerRef.current)
        fireplaceCrackTimerRef.current = null
      }
      for (let i = 0; i < coffeeSyllableTimersRef.current.length; i++) {
        const t = coffeeSyllableTimersRef.current[i]
        if (t !== null) {
          window.clearTimeout(t)
          coffeeSyllableTimersRef.current[i] = null
        }
      }
      for (const source of allSourcesRef.current) {
        try {
          source.stop()
        } catch {
          // .stop() puede tirar InvalidStateError si ya terminó; es benigno.
        }
      }
      for (const node of allNodesRef.current) {
        try {
          node.disconnect()
        } catch {
          // ya desconectado o nunca conectado
        }
      }
      allSourcesRef.current = []
      allNodesRef.current = []
      userGainsRef.current = emptyUserGains()
      isInitializedRef.current = false
    }
  }, [])

  return { channels, setChannelVolume }
}
