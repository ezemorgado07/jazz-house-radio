import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type {
  AmbientChannel,
  AmbientChannelId,
  AmbientMixer,
} from '../types'
import {
  generateBrownNoiseBuffer,
  generateCrackleBuffer,
  generatePinkNoiseBuffer,
} from './noise'

const CHANNEL_DEFAULTS: AmbientChannel[] = [
  { id: 'rain', label: 'Rain', volume: 0 },
  { id: 'crackle', label: 'Vinyl crackle', volume: 0 },
  { id: 'coffee', label: 'Café murmur', volume: 0 },
]

const BUFFER_SECONDS = 10

type NodeMap<T> = Record<AmbientChannelId, T | null>

const emptyMap = <T>(): NodeMap<T> => ({
  rain: null,
  crackle: null,
  coffee: null,
})

export function useAmbientMixer(
  contextRef: RefObject<AudioContext | null>,
  masterGainRef: RefObject<GainNode | null>,
  ensureReady: () => Promise<void>,
): AmbientMixer {
  const [channels, setChannels] = useState<AmbientChannel[]>(CHANNEL_DEFAULTS)

  const sourcesRef = useRef<NodeMap<AudioBufferSourceNode>>(emptyMap())
  const filtersRef = useRef<NodeMap<BiquadFilterNode>>(emptyMap())
  const gainsRef = useRef<NodeMap<GainNode>>(emptyMap())
  const isInitializedRef = useRef(false)

  const buildChannels = useCallback(async (): Promise<void> => {
    // Guard sincrónico: dos sliders movidos en el mismo tick pueden awaitear
    // ensureReady a la vez; marcamos el flag antes del await para que la
    // segunda llamada vea el init en curso y no construya el grafo de nuevo.
    if (isInitializedRef.current) return
    isInitializedRef.current = true

    await ensureReady()
    const ctx = contextRef.current
    const master = masterGainRef.current
    if (!ctx || !master) {
      isInitializedRef.current = false
      return
    }

    // Rain: pink noise → highpass agudo → gain. Cuando pink pasa por un
    // highpass ~1kHz suena a lluvia pegando contra una ventana.
    {
      const buf = generatePinkNoiseBuffer(ctx, BUFFER_SECONDS)
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.loop = true
      const filter = ctx.createBiquadFilter()
      filter.type = 'highpass'
      filter.frequency.value = 1000
      filter.Q.value = 0.7
      const gain = ctx.createGain()
      gain.gain.value = 0
      src.connect(filter)
      filter.connect(gain)
      // Conectamos al masterGain, NO al analyser: el ambiente no debe
      // alterar lo que el visualizador ve de la radio.
      gain.connect(master)
      src.start(0)
      sourcesRef.current.rain = src
      filtersRef.current.rain = filter
      gainsRef.current.rain = gain
    }

    // Crackle: buffer de clicks aleatorios → highshelf que acentúa agudos.
    {
      const buf = generateCrackleBuffer(ctx, BUFFER_SECONDS)
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.loop = true
      const filter = ctx.createBiquadFilter()
      filter.type = 'highshelf'
      filter.frequency.value = 2000
      filter.gain.value = 6
      const gain = ctx.createGain()
      gain.gain.value = 0
      src.connect(filter)
      filter.connect(gain)
      gain.connect(master)
      src.start(0)
      sourcesRef.current.crackle = src
      filtersRef.current.crackle = filter
      gainsRef.current.crackle = gain
    }

    // Coffee: brown noise → bandpass angosto cerca del rango vocal.
    {
      const buf = generateBrownNoiseBuffer(ctx, BUFFER_SECONDS)
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.loop = true
      const filter = ctx.createBiquadFilter()
      filter.type = 'bandpass'
      filter.frequency.value = 500
      filter.Q.value = 0.9
      const gain = ctx.createGain()
      gain.gain.value = 0
      src.connect(filter)
      filter.connect(gain)
      gain.connect(master)
      src.start(0)
      sourcesRef.current.coffee = src
      filtersRef.current.coffee = filter
      gainsRef.current.coffee = gain
    }
  }, [contextRef, masterGainRef, ensureReady])

  const setChannelVolume = useCallback(
    async (id: AmbientChannelId, volume: number): Promise<void> => {
      await buildChannels()
      const clamped = Math.max(0, Math.min(1, volume))
      setChannels((prev) =>
        prev.map((c) => (c.id === id ? { ...c, volume: clamped } : c)),
      )
      const ctx = contextRef.current
      const gain = gainsRef.current[id]
      if (ctx && gain) {
        // 30ms de rampa para evitar clicks al mover el slider.
        gain.gain.setTargetAtTime(clamped, ctx.currentTime, 0.03)
      }
    },
    [buildChannels, contextRef],
  )

  useEffect(() => {
    return () => {
      const ids: AmbientChannelId[] = ['rain', 'crackle', 'coffee']
      for (const id of ids) {
        const source = sourcesRef.current[id]
        if (source) {
          try {
            source.stop()
          } catch {
            // ignore: ya detenido o nunca arrancó
          }
          source.disconnect()
        }
        filtersRef.current[id]?.disconnect()
        gainsRef.current[id]?.disconnect()
        sourcesRef.current[id] = null
        filtersRef.current[id] = null
        gainsRef.current[id] = null
      }
      isInitializedRef.current = false
    }
  }, [])

  return { channels, setChannelVolume }
}
