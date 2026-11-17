import { THEMES } from '../theme/themes'
import { useTheme } from '../theme/useTheme'

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()

  return (
    <div className="fixed top-4 right-4 z-10 flex gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)]/70 p-1 backdrop-blur-md">
      {THEMES.map((t) => {
        const active = t.id === theme
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => setTheme(t.id)}
            aria-label={`Switch to ${t.label} theme`}
            aria-pressed={active}
            className={
              'cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition-colors ' +
              (active
                ? 'bg-[var(--accent)] text-[var(--bg)]'
                : 'text-[var(--text-dim)] hover:text-[var(--text)]')
            }
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}
