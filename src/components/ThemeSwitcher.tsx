import { THEMES, THEME_SWATCHES } from '../theme/themes'
import { useTheme } from '../theme/useTheme'

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="fixed top-4 right-4 z-10 flex gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)]/70 p-1 backdrop-blur-md sm:gap-2 sm:p-2">
      {THEMES.map((t) => {
        const active = t.id === theme
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => setTheme(t.id)}
            aria-label={`Switch to ${t.label} theme`}
            aria-pressed={active}
            // Mobile: solo el dot de color. sm+: dot + label.
            // El ring del tema activo usa var(--accent), que SÍ es el accent
            // del tema actual (el seleccionado), por lo que siempre matchea
            // visualmente el dot ganador.
            className={
              'flex cursor-pointer items-center rounded-full px-1.5 py-1 text-xs font-medium transition-colors sm:px-3 ' +
              (active
                ? 'text-[var(--text)] ring-2 ring-[var(--accent)]'
                : 'text-[var(--text-dim)] hover:text-[var(--text)]')
            }
          >
            <span
              aria-hidden="true"
              className="block h-3 w-3 shrink-0 rounded-full"
              style={{ background: THEME_SWATCHES[t.id] }}
            />
            <span className="ml-2 hidden sm:inline">{t.label}</span>
          </button>
        )
      })}
    </div>
  )
}
