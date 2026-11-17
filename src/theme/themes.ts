export type ThemeId = 'midnight' | 'rainy' | 'vinyl'

export interface Theme {
  id: ThemeId
  label: string
}

export const THEMES: readonly Theme[] = [
  { id: 'midnight', label: 'Midnight Club' },
  { id: 'rainy', label: 'Rainy Café' },
  { id: 'vinyl', label: 'Vinyl Sunset' },
] as const

export const DEFAULT_THEME: ThemeId = 'midnight'
export const STORAGE_KEY = 'jhr:theme'
