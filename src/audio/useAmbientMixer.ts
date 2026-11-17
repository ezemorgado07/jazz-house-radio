import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type {
  AmbientChannel,
  AmbientChannelId,
  AmbientMixer,
} from '../types'
import { generatePinkNoiseBuffer } from './noise'

const CHANNEL_DEFAULTS: AmbientChannel[] = [
  { id: 'rain', label: 'Rain', volume: 0 },
  { id: 'fireplace', label: 'Fireplace', volume: 0 },
  { id: 'coffee', label: 'Café murmur', volume: 0 },
]

const BUFFER_SECONDS = 10
const COFFEE_SAMPLE_URL = '/sounds/coffee-ambience.mp3'

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
  // Strikes in-flight dentro de un evento de tormenta (hasta 3). El cleanup
  // tiene que cancelarlos si el componente desmonta mid-tormenta.
  const thunderStrikeTimersRef = useRef<number[]>([])
  const fireplaceCrackTimerRef = useRef<number | null>(null)
  const coffeeLoadedRef = useRef(false)
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
    // LFO 0.02Hz modula modGain. Thunder scheduler cada 12–18s: cada evento
    // dispara 1, 2 o 3 strikes seguidos (55/30/15%) con delays cortos.
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

      const playThunder = (delayMs: number): void => {
        const timerId = window.setTimeout(() => {
          const now = ctx.currentTime
          // Cada strike individual varía — distinto tono, distinta amplitud,
          // distinta duración — para que ni siquiera dentro del mismo
          // evento se oigan dos iguales.
          const strikeFreq = 300 + Math.random() * 100
          const strikePeak = 0.8 + Math.random() * 0.3
          const strikeDecay = 2.5 + Math.random() * 1.0

          const length = Math.floor(ctx.sampleRate * strikeDecay)
          const thunderBuf = ctx.createBuffer(1, length, ctx.sampleRate)
          const data = thunderBuf.getChannelData(0)
          for (let i = 0; i < length; i++) {
            data[i] = Math.random() * 2 - 1
          }

          const thunderSrc = ctx.createBufferSource()
          thunderSrc.buffer = thunderBuf
          const thunderFilter = ctx.createBiquadFilter()
          thunderFilter.type = 'lowpass'
          thunderFilter.frequency.value = strikeFreq
          thunderFilter.Q.value = 1.5
          const envGain = ctx.createGain()
          envGain.gain.setValueAtTime(0, now)
          envGain.gain.linearRampToValueAtTime(strikePeak, now + 0.1)
          envGain.gain.exponentialRampToValueAtTime(0.001, now + strikeDecay)

          thunderSrc.connect(thunderFilter)
          thunderFilter.connect(envGain)
          envGain.connect(userGain)

          thunderSrc.start(now)
          thunderSrc.stop(now + strikeDecay + 0.5)
        }, delayMs)
        thunderStrikeTimersRef.current.push(timerId)
      }

      const scheduleThunder = (): void => {
        const delayMs = 12000 + Math.random() * 6000 // 12–18 s
        thunderTimerRef.current = window.setTimeout(() => {
          // Ponderación 55/30/15 para 1/2/3 strikes por evento.
          const r = Math.random()
          const strikeCount = r < 0.55 ? 1 : r < 0.85 ? 2 : 3
          const strikeDelays = [
            0,
            200 + Math.random() * 300,
            400 + Math.random() * 500,
          ]
          for (let i = 0; i < strikeCount; i++) {
            playThunder(strikeDelays[i])
          }
          scheduleThunder()
        }, delayMs)
      }
      scheduleThunder()
    }

    // ============ FIREPLACE ============
    // Fondo constante: pink → lowpass 800Hz Q=0.5 → baseGain(0.15) → userGain.
    // Wood-crack scheduler cada 3–7s con variación completa por crack:
    // freq, peak, attack, decay y Q todos random. 10% de probabilidad de
    // "big crack" (tronco grande: peak × 1.8, decay × 1.5, buffer 250ms).
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
          const isBigCrack = Math.random() < 0.1
          const bufferDuration = isBigCrack ? 0.25 : 0.15
          const peakMul = isBigCrack ? 1.8 : 1.0
          const decayMul = isBigCrack ? 1.5 : 1.0

          const freq = 2000 + Math.random() * 1500
          const peak = (0.4 + Math.random() * 0.3) * peakMul
          const attack = 0.003 + Math.random() * 0.008 // 3–11 ms
          const decay = (0.2 + Math.random() * 0.25) * decayMul // 200–450 ms (× 1.5 si big)
          const q = 2 + Math.random() * 4 // 2–6

          const crackBuf = generatePinkNoiseBuffer(ctx, bufferDuration)
          const crackSrc = ctx.createBufferSource()
          crackSrc.buffer = crackBuf
          const crackFilter = ctx.createBiquadFilter()
          crackFilter.type = 'bandpass'
          crackFilter.frequency.value = freq
          crackFilter.Q.value = q
          const envGain = ctx.createGain()
          envGain.gain.setValueAtTime(0.0001, now)
          envGain.gain.linearRampToValueAtTime(peak, now + attack)
          envGain.gain.exponentialRampToValueAtTime(
            0.0001,
            now + attack + decay,
          )

          crackSrc.connect(crackFilter)
          crackFilter.connect(envGain)
          envGain.connect(userGain)

          crackSrc.start(now)
          crackSrc.stop(now + attack + decay + 0.05)

          scheduleWoodCrack()
        }, delayMs)
      }
      scheduleWoodCrack()
    }

    // ============ COFFEE ============
    // Migrado de síntesis a sample real: el canal usa un archivo en
    // public/sounds/coffee-ambience.mp3 (murmullos + clinks + tenedores).
    // Si el archivo no existe o falla la decode, logueamos un warning y
    // dejamos el canal deshabilitado (userGain queda null). El resto del
    // mixer sigue funcionando normalmente — rain y fireplace son sintéticos
    // y no dependen de IO.
    try {
      const response = await fetch(COFFEE_SAMPLE_URL)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const arrayBuffer = await response.arrayBuffer()
      const coffeeBuffer = await ctx.decodeAudioData(arrayBuffer)

      const src = ctx.createBufferSource()
      src.buffer = coffeeBuffer
      src.loop = true
      const userGain = ctx.createGain()
      userGain.gain.value = 0

      src.connect(userGain)
      userGain.connect(master)
      src.start(0)

      sources.push(src)
      nodes.push(src, userGain)
      userGainsRef.current.coffee = userGain
      coffeeLoadedRef.current = true
    } catch (err) {
      console.warn(
        '[ambient] coffee-ambience.mp3 not found, coffee channel disabled',
        err,
      )
      coffeeLoadedRef.current = false
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
      // El check de `gain` cubre dos casos: el canal nunca se inicializó
      // (buildChannels falló por falta de ctx) o el canal coffee no cargó
      // su sample. En ambos la UI sigue mostrando el slider moviéndose
      // pero no sale audio.
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
      for (const t of thunderStrikeTimersRef.current) {
        window.clearTimeout(t)
      }
      thunderStrikeTimersRef.current = []
      if (fireplaceCrackTimerRef.current !== null) {
        window.clearTimeout(fireplaceCrackTimerRef.current)
        fireplaceCrackTimerRef.current = null
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
      coffeeLoadedRef.current = false
      isInitializedRef.current = false
    }
  }, [])

  return { channels, setChannelVolume }
}
