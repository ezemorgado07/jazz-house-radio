import type { Station } from '../types'

export const CURATED_STATIONS: readonly Station[] = [
  {
    id: 'rp-mellow',
    name: 'Radio Paradise — Mellow',
    url: 'https://stream.radioparadise.com/mellow-128',
    tags: 'mellow mix, downtempo, chill',
    bitrate: 128,
    codec: 'MP3',
    homepage: 'https://radioparadise.com/',
  },
  {
    id: 'rp-main',
    name: 'Radio Paradise — Main',
    url: 'https://stream.radioparadise.com/mp3-128',
    tags: 'eclectic, hand-picked, diverse',
    bitrate: 128,
    codec: 'MP3',
    homepage: 'https://radioparadise.com/',
  },
  {
    id: 'rp-global',
    name: 'Radio Paradise — Global',
    url: 'https://stream.radioparadise.com/global-128',
    tags: 'world music, multicultural',
    bitrate: 128,
    codec: 'MP3',
    homepage: 'https://radioparadise.com/',
  },
  {
    id: 'rp-eclectic',
    name: 'Radio Paradise — Eclectic',
    url: 'https://stream.radioparadise.com/eclectic-128',
    tags: 'eclectic, varied',
    bitrate: 128,
    codec: 'MP3',
    homepage: 'https://radioparadise.com/',
  },
  {
    id: 'rp-rock',
    name: 'Radio Paradise — Rock',
    url: 'https://stream.radioparadise.com/rock-128',
    tags: 'rock mix, varied',
    bitrate: 128,
    codec: 'MP3',
    homepage: 'https://radioparadise.com/',
  },
] as const
