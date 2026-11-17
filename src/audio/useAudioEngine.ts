import { useCallback, useEffect, useRef, useState } from 'react'
import type { AudioEngine, PlaybackStatus } from '../types'

type WebkitWindow = { webkitAudioContext: typeof AudioContext }

export function useAudioEngine(): AudioEngine {
  const [status, setStatus] = useState<PlaybackStatus>('idle')
  const [volume, setVolumeState] = useState(0.8)
  const [isMuted, setIsMuted] = useState(false)

  const contextRef = useRef<AudioContext | null>(null)
  const audioElRef = useRef<HTMLAudioElement | null>(null)
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null)
  const radioGainRef = useRef<GainNode | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const masterGainRef = useRef<GainNode | null>(null)
  const volumeRef = useRef(0.8)
  const isMutedRef = useRef(false)
  const objectUrlRef = useRef<string | null>(null)

  // Rampas exponenciales cortas para evitar clicks al cambiar volumen o mutear.
  // Dos helpers separados porque ahora el slider y el mute apuntan a nodos
  // distintos del grafo.
  const rampRadioGain = useCallback((target: number) => {
    const ctx = contextRef.current
    const radio = radioGainRef.current
    if (!ctx || !radio) return
    radio.gain.setTargetAtTime(target, ctx.currentTime, 0.02)
  }, [])

  const rampMasterGain = useCallback((target: number) => {
    const ctx = contextRef.current
    const master = masterGainRef.current
    if (!ctx || !master) return
    master.gain.setTargetAtTime(target, ctx.currentTime, 0.02)
  }, [])

  const ensureReady = useCallback(async (): Promise<void> => {
    // Idempotente: si el grafo ya existe, solo despertamos el contexto.
    // Un AudioContext creado en una interacción previa puede volver a
    // 'suspended' después (background tab, bluetooth cambia de device, etc.).
    if (contextRef.current) {
      if (contextRef.current.state === 'suspended') {
        await contextRef.current.resume()
      }
      return
    }

    const Ctor: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as WebkitWindow).webkitAudioContext
    const ctx = new Ctor()

    const el = new Audio()
    // crossOrigin DEBE setearse antes de asignar cualquier src, sino el
    // analyser recibe silencio y el fetch del stream puede caer sin señal.
    el.crossOrigin = 'anonymous'
    el.preload = 'none'

    // createMediaElementSource se llama UNA SOLA VEZ por <audio>, para siempre.
    // Reconstruirlo tira InvalidStateError. Para cambiar de estación o archivo,
    // reasignamos el.src más abajo — nunca recreamos el nodo source.
    const source = ctx.createMediaElementSource(el)
    const radioGain = ctx.createGain()
    const analyser = ctx.createAnalyser()
    const masterGain = ctx.createGain()

    analyser.fftSize = 2048
    analyser.smoothingTimeConstant = 0.8
    // Reparto de responsabilidades en el grafo:
    //  - radioGain lo controla el slider "Radio" del Player.
    //  - masterGain queda dedicado al mute (1 o 0) y no cambia por volumen.
    // Los ambient channels entran al masterGain después del analyser, así
    // que también quedan silenciados por el mute pero no por el slider de radio.
    radioGain.gain.value = isMutedRef.current ? 0 : volumeRef.current
    masterGain.gain.value = isMutedRef.current ? 0 : 1

    // Cadena: el ambiente se mezclará DESPUÉS del analyser en un paso futuro,
    // para que el visualizador reaccione solo a la música de la radio.
    source.connect(radioGain)
    radioGain.connect(analyser)
    analyser.connect(masterGain)
    masterGain.connect(ctx.destination)

    el.addEventListener('playing', () => setStatus('playing'))
    el.addEventListener('waiting', () => setStatus('loading'))
    el.addEventListener('stalled', () => setStatus('loading'))
    el.addEventListener('pause', () => setStatus('paused'))
    el.addEventListener('error', () => setStatus('error'))

    contextRef.current = ctx
    audioElRef.current = el
    sourceRef.current = source
    radioGainRef.current = radioGain
    analyserRef.current = analyser
    masterGainRef.current = masterGain

    await ctx.resume()
  }, [])

  const loadStream = useCallback(
    async (url: string) => {
      await ensureReady()
      const el = audioElRef.current
      if (!el) return
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
      setStatus('loading')
      el.preload = 'auto'
      el.src = url
      try {
        await el.play()
      } catch {
        setStatus('error')
      }
    },
    [ensureReady],
  )

  const loadLocalFile = useCallback(
    async (file: File) => {
      await ensureReady()
      const el = audioElRef.current
      if (!el) return
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
      }
      const url = URL.createObjectURL(file)
      objectUrlRef.current = url
      setStatus('loading')
      el.preload = 'auto'
      el.src = url
      try {
        await el.play()
      } catch {
        setStatus('error')
      }
    },
    [ensureReady],
  )

  const play = useCallback(async () => {
    await ensureReady()
    const el = audioElRef.current
    if (!el || !el.src) return
    try {
      await el.play()
    } catch {
      setStatus('error')
    }
  }, [ensureReady])

  const pause = useCallback(() => {
    audioElRef.current?.pause()
  }, [])

  const togglePlay = useCallback(async () => {
    const el = audioElRef.current
    if (el && !el.paused) {
      el.pause()
      return
    }
    await play()
  }, [play])

  const setVolume = useCallback(
    (v: number) => {
      const clamped = Math.max(0, Math.min(1, v))
      volumeRef.current = clamped
      setVolumeState(clamped)
      // Siempre apuntamos a radioGain. Si está muted, masterGain=0 ya
      // garantiza silencio, y al desmutear la radio sale al nuevo nivel.
      rampRadioGain(clamped)
    },
    [rampRadioGain],
  )

  const toggleMute = useCallback(() => {
    const next = !isMutedRef.current
    isMutedRef.current = next
    setIsMuted(next)
    // El mute vive en el masterGain — silencia TODO (radio + ambient) sin
    // tocar los niveles individuales, así al desmutear volvemos exactamente
    // a la mezcla previa.
    rampMasterGain(next ? 0 : 1)
  }, [rampMasterGain])

  useEffect(() => {
    return () => {
      const el = audioElRef.current
      if (el) {
        try {
          el.pause()
        } catch {
          // ignore: elemento podría estar en estado inconsistente al desmontar
        }
        el.removeAttribute('src')
        el.load()
      }
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
      sourceRef.current?.disconnect()
      radioGainRef.current?.disconnect()
      analyserRef.current?.disconnect()
      masterGainRef.current?.disconnect()
      const ctx = contextRef.current
      if (ctx && ctx.state !== 'closed') {
        ctx.close().catch(() => {
          // ignore: cerrar un context ya cerrado no es un error del usuario
        })
      }
      sourceRef.current = null
      radioGainRef.current = null
      analyserRef.current = null
      masterGainRef.current = null
      contextRef.current = null
      audioElRef.current = null
    }
  }, [])

  return {
    status,
    volume,
    isMuted,
    analyserRef,
    contextRef,
    masterGainRef,
    ensureReady,
    loadStream,
    loadLocalFile,
    play,
    pause,
    togglePlay,
    setVolume,
    toggleMute,
  }
}
