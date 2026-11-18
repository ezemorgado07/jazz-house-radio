import type { Station } from '../../types'

interface StationListProps {
  stations: readonly Station[]
  currentId: string | null
  onSelect: (id: string) => void
}

export function StationList({
  stations,
  currentId,
  onSelect,
}: StationListProps) {
  return (
    <div
      role="listbox"
      aria-label="Stations"
      className="w-full snap-x snap-mandatory overflow-x-auto scroll-smooth"
    >
      <div className="flex gap-3 pb-2">
        {stations.map((s) => {
          const active = s.id === currentId
          return (
            <button
              key={s.id}
              type="button"
              role="option"
              aria-selected={active}
              onClick={() => onSelect(s.id)}
              className={
                'flex min-w-[180px] max-w-[180px] shrink-0 snap-start cursor-pointer flex-col gap-1 rounded-xl border px-4 py-3 text-left backdrop-blur-md transition-colors sm:min-w-[220px] sm:max-w-[220px] ' +
                (active
                  ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--text)]'
                  : 'border-[var(--border)] bg-[var(--surface)]/60 text-[var(--text)] hover:border-[var(--accent)]/40')
              }
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{s.name}</span>
                {s.bitrate !== undefined && (
                  <span className="shrink-0 rounded-full border border-[var(--border)] px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--text-dim)]">
                    {s.bitrate}k
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="shrink-0 rounded bg-[var(--accent)]/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-[var(--accent)]">
                  {s.genre}
                </span>
                <span className="truncate text-xs text-[var(--text-dim)]">
                  {s.tags}
                </span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
