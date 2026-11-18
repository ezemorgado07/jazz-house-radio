import type { AmbientChannelId, AmbientMixer } from '../../types'

const CHANNEL_ICONS: Record<AmbientChannelId, string> = {
  rain: '🌧',
  fireplace: '🔥',
  coffee: '☕',
}

interface AmbientMixerProps {
  mixer: AmbientMixer
}

export function AmbientMixer({ mixer }: AmbientMixerProps) {
  return (
    <section className="flex w-full flex-col gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/60 p-6 backdrop-blur-md">
      <h2 className="text-xs uppercase tracking-[0.3em] text-[var(--text-dim)]">
        Ambient
      </h2>
      <div className="flex flex-col divide-y divide-[var(--border)]">
        {mixer.channels.map((c) => {
          const active = c.volume > 0
          const percent = Math.round(c.volume * 100)
          return (
            <div key={c.id} className="flex items-center gap-3 py-2">
              <div
                className={
                  'flex w-20 shrink-0 items-center gap-2 text-sm transition-colors sm:w-24 ' +
                  (active
                    ? 'text-[var(--accent)]'
                    : 'text-[var(--text-dim)]')
                }
              >
                <span aria-hidden="true" className="text-base leading-none">
                  {CHANNEL_ICONS[c.id]}
                </span>
                <span className="truncate">{c.label}</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="1"
                value={percent}
                onChange={(e) =>
                  void mixer.setChannelVolume(
                    c.id,
                    Number(e.target.value) / 100,
                  )
                }
                aria-label={`${c.label} volume`}
                className="flex-1 cursor-pointer accent-[var(--accent)]"
              />
              <span className="w-10 shrink-0 text-right text-xs tabular-nums text-[var(--text-dim)]">
                {percent}%
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
