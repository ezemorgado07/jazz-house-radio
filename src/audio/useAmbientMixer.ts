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
          thunderFilter.frequency.value = 150
          thunderFilter.Q.value = 2
          const envGain = ctx.createGain()
          envGain.gain.setValueAtTime(0, now)
          envGain.gain.linearRampToValueAtTime(0.8, now + 0.1)
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
        const delayMs = 12000 + Math.random() * 6000
        fireplaceCrackTimerRef.current = window.setTimeout(() => {
          const now = ctx.currentTime
          // Buffer fresco por crack: cada click suena distinto en vez de
          // repetir la misma forma de onda cada vez.
          const crackBuf = generatePinkNoiseBuffer(ctx, 0.15)
          const crackSrc = ctx.createBufferSource()
          crackSrc.buffer = crackBuf
          const crackFilter = ctx.createBiquadFilter()
          crackFilter.type = 'bandpass'
          crackFilter.frequency.value = 2800
          crackFilter.Q.value = 4
          const envGain = ctx.createGain()
          envGain.gain.setValueAtTime(0.0001, now)
          envGain.gain.linearRampToValueAtTime(0.5, now + 0.005)
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
    // Room tone: brown → bandpass 500Hz → baseGain(0.35) → userGain
    // 3 voces basadas en sílabas: cada una tiene una fuente pink compartida,
    // su propio bandpass (frecuencia cambia por sílaba) y un voiceGain con
    // envelope ADR disparado por un scheduler independiente con pausas.
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
      baseGain.gain.value = 0.35
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
      const voiceSpecs = [
        { freqMin: 350, freqMax: 700, q: 10 },
        { freqMin: 550, freqMax: 1100, q: 12 },
        { freqMin: 1300, freqMax: 2700, q: 14 },
      ]
      const voiceFilters: BiquadFilterNode[] = []
      const voiceGains: GainNode[] = []

      for (const spec of voiceSpecs) {
        const vSrc = ctx.createBufferSource()
        vSrc.buffer = sharedPink
        vSrc.loop = true
        const filter = ctx.createBiquadFilter()
        filter.type = 'bandpass'
        filter.Q.value = spec.q
        // Frecuencia inicial: central del rango. Se cambia por sílaba.
        filter.frequency.value = (spec.freqMin + spec.freqMax) / 2
        const voiceGain = ctx.createGain()
        // exponentialRampToValueAtTime no acepta 0, usamos un valor minúsculo.
        voiceGain.gain.value = 0.0001

        vSrc.connect(filter)
        filter.connect(voiceGain)
        voiceGain.connect(userGain)

        vSrc.start(0)
        sources.push(vSrc)
        nodes.push(vSrc, filter, voiceGain)
        voiceFilters.push(filter)
        voiceGains.push(voiceGain)
      }

      const scheduleNextSyllable = (voiceIdx: number): void => {
        const now = ctx.currentTime
        const spec = voiceSpecs[voiceIdx]
        const filter = voiceFilters[voiceIdx]
        const voiceGain = voiceGains[voiceIdx]

        const freq =
          spec.freqMin + Math.random() * (spec.freqMax - spec.freqMin)
        filter.frequency.setValueAtTime(freq, now)

        const attack = 0.05
        const hold = 0.1 + Math.random() * 0.15
        const release = 0.08 + Math.random() * 0.05
        const silence = 0.2 + Math.random() * 0.6
        const peak = 0.2 + Math.random() * 0.15

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

      // Desfase inicial: si las tres voces arrancan en el mismo instante,
      // sus primeras sílabas coinciden y suenan sincopadas.
      const staggerDelays = [0, 180, 340]
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
