import { useState, type ChangeEvent } from 'react'
import { ThemeSwitcher } from './components/ThemeSwitcher'
import { Visualizer } from './components/Visualizer/Visualizer'
import { useAudioEngine } from './audio/useAudioEngine'

function App() {
  const {
    status,
    volume,
    isMuted,
    analyserRef,
    loadLocalFile,
    togglePlay,
    toggleMute,
    setVolume,
  } = useAudioEngine()
  const [fileName, setFileName] = useState<string | null>(null)

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFileName(f.name)
    void loadLocalFile(f)
  }

  const isPlaying = status === 'playing'
  const isLoading = status === 'loading'

  return (
    <main className="min-h-screen grid place-items-center bg-[var(--bg)] px-6 py-12">
      <ThemeSwitcher />
      <div className="flex w-full max-w-xl flex-col items-center gap-10">
        <div className="text-center">
          <h1 className="text-5xl sm:text-6xl font-semibold tracking-tight text-[var(--accent)]">
            Jazz House Radio
          </h1>
          <p className="mt-3 text-sm text-[var(--text-dim)]">
            Setting up the studio...
          </p>
        </div>

        <Visualizer analyserRef={analyserRef} isActive={status === 'playing'} />

        <section className="flex w-full flex-col gap-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/60 p-6 backdrop-blur-md">
          <label className="group inline-flex w-full cursor-pointer items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--glass)] px-4 py-3 text-sm text-[var(--text)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]">
            <input
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={onFileChange}
            />
            <span className="truncate">
              {fileName ?? 'Load audio file…'}
            </span>
          </label>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => void togglePlay()}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              aria-pressed={isPlaying}
              className={
                'grid h-12 w-12 cursor-pointer place-items-center rounded-full border transition-colors ' +
                (isPlaying
                  ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--glass)]'
                  : 'border-[var(--border)] text-[var(--text)] bg-[var(--glass)] hover:border-[var(--accent)] hover:text-[var(--accent)]')
              }
            >
              {isLoading ? (
                <span
                  aria-hidden="true"
                  className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--text-dim)] border-t-[var(--accent)]"
                />
              ) : isPlaying ? (
                <span className="text-sm leading-none">❚❚</span>
              ) : (
                <span className="text-base leading-none">▶</span>
              )}
            </button>

            <button
              type="button"
              onClick={toggleMute}
              aria-label={isMuted ? 'Unmute' : 'Mute'}
              aria-pressed={isMuted}
              className={
                'grid h-10 w-10 cursor-pointer place-items-center rounded-full border transition-colors ' +
                (isMuted
                  ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--glass)]'
                  : 'border-[var(--border)] text-[var(--text)] bg-[var(--glass)] hover:border-[var(--accent)] hover:text-[var(--accent)]')
              }
            >
              <span aria-hidden="true">{isMuted ? '🔇' : '🔊'}</span>
            </button>

            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              aria-label="Volume"
              className="flex-1 cursor-pointer accent-[var(--accent)]"
            />
          </div>

          <div className="text-xs uppercase tracking-wide text-[var(--text-dim)]">
            Status:{' '}
            <span className="text-[var(--text)]">{status}</span>
          </div>
        </section>
      </div>
    </main>
  )
}

export default App
