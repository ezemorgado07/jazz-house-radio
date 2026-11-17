import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type {
  AmbientChannel,
  AmbientChannelId,
  AmbientMixer,
} from '../types'
import {
  generateBrownNoiseBuffer,
  generateFireplaceBuffer,
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

  // Centralizamos tracking: todo lo start-able (sources + LFOs) a allSourcesRef,
  // todo lo conectable a allNodesRef. Cleanup itera sobre ambos.
  // Los userGain de cada canal quedan en un map para que setChannelVolume
  // los encuentre por id.
  const allSourcesRef = useRef<AudioScheduledSourceNode[]>([])
  const allNodesRef = useRef<AudioNode[]>([])
  const userGainsRef = useRef<UserGainMap>(emptyUserGains())
  const thunderTimerRef = useRef<number | null>(null)
  const isInitializedRef = useRef(false)

  const buildChannels = useCallback(async (): Promise<void> => {
    // Guard sincrónico: dos sliders en el mismo tick no deben construir dos veces.
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
    // LFO 0.02Hz modula modGain para que la intensidad varíe sola.
    // Thunder scheduler: cada 20-60s dispara un trueno grave.
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
      lfo.frequency.value = 0.02 // 1 ciclo cada 50s
      const lfoGain = ctx.createGain()
      lfoGain.gain.value = 0.4 // swing ±0.4 sobre el base 1.0 de modGain
      lfo.connect(lfoGain)
      lfoGain.connect(modGain.gain)

      src.start(0)
      lfo.start(0)

      sources.push(src, lfo)
      nodes.push(src, filter, modGain, userGain, lfo, lfoGain)
      userGainsRef.current.rain = userGain

      // Thunder: se re-agenda a sí mismo. El src del trueno no lo trackeamos
      // porque tiene .stop(now+3.5) agendado y se auto-finaliza; si el
      // cleanup corre mientras un trueno suena, al desconectar userGain
      // deja de ser audible y termina su vida natural.
      const scheduleThunder = (): void => {
        const delayMs = 20000 + Math.random() * 40000 // 20–60 s
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
          // Conectamos al userGain del canal rain: así el slider del usuario
          // también controla cuánto suena el trueno.
          envGain.connect(userGain)

          thunderSrc.start(now)
          thunderSrc.stop(now + 3.5)

          scheduleThunder()
        }, delayMs)
      }
      scheduleThunder()
    }

    // ============ FIREPLACE ============
    // fireplace buffer (pink+crackles) → lowpass 2kHz → userGain → master
    {
      const buf = generateFireplaceBuffer(ctx, BUFFER_SECONDS)
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.loop = true

      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 2000
      filter.Q.value = 0.7

      const userGain = ctx.createGain()
      userGain.gain.value = 0

      src.connect(filter)
      filter.connect(userGain)
      userGain.connect(master)

      src.start(0)

      sources.push(src)
      nodes.push(src, filter, userGain)
      userGainsRef.current.fireplace = userGain
    }

    // ============ COFFEE ============
    // Capa base: brown noise → bandpass 500Hz → baseGain(0.5) → mixSum
    // 3 capas de formantes: comparten UN pink buffer, cada una con bandpass
    // estrecho + LFO propio modulando su gain → mixSum.
    // mixSum → userGain → master
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
      baseGain.gain.value = 0.5

      const mixSum = ctx.createGain()
      mixSum.gain.value = 1.0
      const userGain = ctx.createGain()
      userGain.gain.value = 0

      brownSrc.connect(brownFilter)
      brownFilter.connect(baseGain)
      baseGain.connect(mixSum)
      brownSrc.start(0)

      sources.push(brownSrc)
      nodes.push(brownSrc, brownFilter, baseGain)

      // Mismo pink buffer para las 3 capas (más eficiente en memoria).
      const sharedPink = generatePinkNoiseBuffer(ctx, BUFFER_SECONDS)
      const formantSpecs = [
        { freq: 500, q: 8, base: 0.25, lfoFreq: 3.5, lfoAmp: 0.2 },
        { freq: 1500, q: 10, base: 0.2, lfoFreq: 4.2, lfoAmp: 0.2 },
        { freq: 2500, q: 12, base: 0.15, lfoFreq: 3.0, lfoAmp: 0.15 },
      ]
      for (const spec of formantSpecs) {
        const src = ctx.createBufferSource()
        src.buffer = sharedPink
        src.loop = true
        const filter = ctx.createBiquadFilter()
        filter.type = 'bandpass'
        filter.frequency.value = spec.freq
        filter.Q.value = spec.q
        const formantGain = ctx.createGain()
        formantGain.gain.value = spec.base

        src.connect(filter)
        filter.connect(formantGain)
        formantGain.connect(mixSum)

        const lfo = ctx.createOscillator()
        lfo.type = 'sine'
        lfo.frequency.value = spec.lfoFreq
        const lfoGain = ctx.createGain()
        lfoGain.gain.value = spec.lfoAmp
        lfo.connect(lfoGain)
        lfoGain.connect(formantGain.gain)

        src.start(0)
        lfo.start(0)

        sources.push(src, lfo)
        nodes.push(src, filter, formantGain, lfo, lfoGain)
      }

      mixSum.connect(userGain)
      userGain.connect(master)
      nodes.push(mixSum, userGain)
      userGainsRef.current.coffee = userGain
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
        // 30ms de rampa para evitar clicks al mover el slider.
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
