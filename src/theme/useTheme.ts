import { useCallback, useEffect, useState } from 'react'
import { DEFAULT_THEME, STORAGE_KEY, type ThemeId } from './themes'

function isThemeId(value: unknown): value is ThemeId {
  return value === 'midnight' || value === 'rainy' || value === 'vinyl'
}

function readStoredTheme(): ThemeId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (isThemeId(stored)) return stored
  } catch {
    // localStorage puede tirar en Safari modo privado o con cookies bloqueadas
  }
  return DEFAULT_THEME
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeId>(readStoredTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // mismo caso: storage bloqueado, lo ignoramos
    }
  }, [theme])

  const setTheme = useCallback((next: ThemeId) => {
    setThemeState(next)
  }, [])

  return { theme, setTheme }
}
