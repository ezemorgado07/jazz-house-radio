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

// Hex del --accent de cada tema. Hardcodeado porque el swatch de cada botón
// tiene que mostrar el color del tema QUE REPRESENTA, no el del tema activo
// (los var(--accent) del CSS siempre resuelven al activo). Si cambia el accent
// de un tema en index.css, hay que actualizarlo acá también.
export const THEME_SWATCHES: Record<ThemeId, string> = {
  midnight: '#ffb347',
  rainy: '#b8946a',
  vinyl: '#e8794a',
}

export const DEFAULT_THEME: ThemeId = 'midnight'
export const STORAGE_KEY = 'jhr:theme'
