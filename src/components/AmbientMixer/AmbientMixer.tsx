import type { ComponentType, SVGProps } from 'react'
import type { AmbientChannelId, AmbientMixer } from '../../types'

type IconProps = SVGProps<SVGSVGElement>

// Íconos SVG inline estilo lucide (CC0). stroke="currentColor" para que
// herede del contenedor según el estado activo/inactivo.
function RainIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
      <path d="M16 14v6" />
      <path d="M8 14v6" />
      <path d="M12 16v6" />
    </svg>
  )
}

function FlameIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
    </svg>
  )
}

function CoffeeIcon(props: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M10 2v2" />
      <path d="M14 2v2" />
      <path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1" />
      <path d="M6 2v2" />
    </svg>
  )
}

const CHANNEL_ICONS: Record<AmbientChannelId, ComponentType<IconProps>> = {
  rain: RainIcon,
  fireplace: FlameIcon,
  coffee: CoffeeIcon,
}

interface AmbientMixerProps {
  mixer: AmbientMixer
}

export function AmbientMixer({ mixer }: AmbientMixerProps) {
  return (
    <section className="flex w-full flex-col gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/60 p-6 backdrop-blur-md">
      <h2 className="font-[var(--font-mono)] text-xs uppercase tracking-[0.2em] text-[var(--text-dim)]">
        Ambient
      </h2>
      <div className="flex flex-col divide-y divide-[var(--border)]">
        {mixer.channels.map((c) => {
          const active = c.volume > 0
          const percent = Math.round(c.volume * 100)
          const Icon = CHANNEL_ICONS[c.id]
          return (
            <div key={c.id} className="flex items-center gap-3 py-2">
              <div
                className={
                  'flex w-20 shrink-0 items-center gap-2 font-sans text-sm transition-colors sm:w-24 ' +
                  (active
                    ? 'text-[var(--accent)]'
                    : 'text-[var(--text-dim)]')
                }
              >
                <Icon className="h-5 w-5 shrink-0" />
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
              <span className="w-10 shrink-0 text-right font-[var(--font-mono)] text-xs tabular-nums text-[var(--text-dim)]">
                {percent}%
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
