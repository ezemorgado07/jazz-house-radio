import type { RefObject } from 'react'

export type PlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error'

export type Genre =
  | 'jazz'
  | 'nu-jazz'
  | 'lofi'
  | 'bossa'
  | 'deep-house'
  | 'techno'
  | 'eclectic'

export interface Station {
  id: string
  name: string
  url: string
  tags: string
  genre: Genre
  bitrate?: number
  codec?: string
  homepage?: string
}

export interface AudioEngine {
  status: PlaybackStatus
  volume: number
  isMuted: boolean
  analyserRef: RefObject<AnalyserNode | null>
  contextRef: RefObject<AudioContext | null>
  masterGainRef: RefObject<GainNode | null>
  ensureReady: () => Promise<void>
  loadStream: (url: string) => Promise<void>
  loadLocalFile: (file: File) => Promise<void>
  play: () => Promise<void>
  pause: () => void
  togglePlay: () => Promise<void>
  setVolume: (v: number) => void
  toggleMute: () => void
}

export type AmbientChannelId = 'rain' | 'fireplace' | 'coffee'

export interface AmbientChannel {
  id: AmbientChannelId
  label: string
  volume: number
}

export interface AmbientMixer {
  channels: AmbientChannel[]
  setChannelVolume: (id: AmbientChannelId, volume: number) => Promise<void>
}
