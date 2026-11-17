import type { RefObject } from 'react'

export type PlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error'

export interface AudioEngine {
  status: PlaybackStatus
  volume: number
  isMuted: boolean
  analyserRef: RefObject<AnalyserNode | null>
  contextRef: RefObject<AudioContext | null>
  masterGainRef: RefObject<GainNode | null>
  loadStream: (url: string) => Promise<void>
  loadLocalFile: (file: File) => Promise<void>
  play: () => Promise<void>
  pause: () => void
  togglePlay: () => Promise<void>
  setVolume: (v: number) => void
  toggleMute: () => void
}
