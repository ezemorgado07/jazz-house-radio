import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { ThemeSwitcher } from './components/ThemeSwitcher'
import { Visualizer } from './components/Visualizer/Visualizer'
import { StationList } from './components/StationList/StationList'
import { AmbientMixer } from './components/AmbientMixer/AmbientMixer'
import { useAudioEngine } from './audio/useAudioEngine'
import { useAmbientMixer } from './audio/useAmbientMixer'
import { useStations } from './radio/useStations'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import type { VisualizerMode } from './components/Visualizer/Visualizer'

const VISUALIZER_MODE_KEY = 'jhr:visualizer-mode'

function App() {
  const engine = useAudioEngine()
  const stationApi = useStations()
  const mixer = useAmbientMixer(
    engine.contextRef,
    engine.masterGainRef,
    engine.ensureReady,
  )

  const [fileName, setFileName] = useState<string | null>(null)
  const [consecutiveErrors, setConsecutiveErrors] = useState(0)
  const [visualizerMode, setVisualizerMode] = useState<VisualizerMode>(() => {
    try {
      const stored = localStorage.getItem(VISUALIZER_MODE_KEY)
      return stored === 'vinyl' ? 'vinyl' : 'spectrum'
    } catch {
      return 'spectrum'
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(VISUALIZER_MODE_KEY, visualizerMode)
    } catch {
      // Safari private mode, cuota llena — ignorar
    }
  }, [visualizerMode])

  // Ref: cuál es la fuente activa — una estación (su id) o un archivo local
  // (null). El auto-skip solo interviene cuando es una estación.
  const activeStationIdRef = useRef<string | null>(null)
  const skipTimerRef = useRef<number | null>(null)

  const handleSelectStation = (id: string) => {
    const s = stationApi.selectStation(id)
    if (!s) return
    activeStationIdRef.current = s.id
    void engine.loadStream(s.url)
  }

  const handleNext = () => {
    const s = stationApi.next()
    activeStationIdRef.current = s.id
    void engine.loadStream(s.url)
  }

  const handlePrev = () => {
    const s = stationApi.prev()
    activeStationIdRef.current = s.id
    void engine.loadStream(s.url)
  }

  const handleLocalFile = (file: File) => {
    activeStationIdRef.current = null
    setFileName(file.name)
    void engine.loadLocalFile(file)
  }

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    handleLocalFile(f)
  }

  useKeyboardShortcuts({
    onTogglePlay: () => void engine.togglePlay(),
    onToggleMute: engine.toggleMute,
    onNext: handleNext,
    onPrev: handlePrev,
  })

  // Auto-prime ambient desde storage: cuando engine.status sale de 'idle' por
  // primera vez (cualquier gesto del usuario desbloqueó el AudioContext),
  // arrancamos los canales que tengan volumen guardado > 0. One-shot via ref
  // para no re-disparar en cada transición de status.
  const hasPrimedAmbientRef = useRef(false)
  useEffect(() => {
    if (hasPrimedAmbientRef.current) return
    if (engine.status === 'idle') return
    hasPrimedAmbientRef.current = true
    void mixer.primeIfStored()
  }, [engine.status, mixer])

  // Auto-skip en error: si la fuente activa es una estación y falla, saltar
  // a la siguiente tras 1.5s, con cap para no loopear si todas fallan.
  useEffect(() => {
    if (engine.status === 'playing') {
      setConsecutiveErrors(0)
      return
    }

    if (
      engine.status !== 'error' ||
      activeStationIdRef.current === null
    ) {
      return
    }

    // Leemos el contador actual del closure y computamos el próximo valor.
    // El effect solo se re-ejecuta por cambios en engine.status (ver deps),
    // así que cada error dispara exactamente un incremento.
    const nextCount = consecutiveErrors + 1
    setConsecutiveErrors(nextCount)

    if (nextCount >= stationApi.stations.length) {
      console.warn('[jhr] all stations failed, stopping auto-skip')
      return
    }

    skipTimerRef.current = window.setTimeout(() => {
      const s = stationApi.next()
      activeStationIdRef.current = s.id
      void engine.loadStream(s.url)
    }, 1500)

    return () => {
      if (skipTimerRef.current !== null) {
        window.clearTimeout(skipTimerRef.current)
        skipTimerRef.current = null
      }
    }
    // Intencional: solo reaccionamos a status. El resto se lee del closure
    // fresco o de refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine.status])

  const isPlaying = engine.status === 'playing'
  const isLoading = engine.status === 'loading'

  const stationsFailed = stationApi.stations.length
  const skipping =
    engine.status === 'error' &&
    activeStationIdRef.current !== null &&
    consecutiveErrors < stationsFailed
  const allFailed =
    engine.status === 'error' &&
    activeStationIdRef.current !== null &&
    consecutiveErrors >= stationsFailed

  return (
    <main className="min-h-screen grid place-items-center bg-[var(--bg)] px-4 pt-12 pb-28 sm:px-6">
      <ThemeSwitcher />
      <div className="flex w-full max-w-xl flex-col items-center gap-8">
        <div className="text-center">
          <h1 className="font-[var(--font-display)] text-4xl font-normal tracking-tight text-[var(--accent)] sm:text-6xl md:text-7xl">
            Jazz House Radio
          </h1>
          <p className="mt-3 text-sm italic text-[var(--text-dim)] sm:text-base">
            Late night jazz house, selected and streaming
          </p>
        </div>

        <div className="relative w-full">
          <Visualizer
            analyserRef={engine.analyserRef}
            isActive={engine.status === 'playing'}
            mode={visualizerMode}
          />
          <div className="absolute top-3 right-3 z-10 flex gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)]/70 p-1 backdrop-blur-md">
            <button
              type="button"
              onClick={() => setVisualizerMode('spectrum')}
              aria-pressed={visualizerMode === 'spectrum'}
              className={
                'cursor-pointer rounded-full px-3 py-1 text-xs transition-colors ' +
                (visualizerMode === 'spectrum'
                  ? 'bg-[var(--accent)] text-[var(--bg)]'
                  : 'text-[var(--text-dim)] hover:text-[var(--text)]')
              }
            >
              Spectrum
            </button>
            <button
              type="button"
              onClick={() => setVisualizerMode('vinyl')}
              aria-pressed={visualizerMode === 'vinyl'}
              className={
                'cursor-pointer rounded-full px-3 py-1 text-xs transition-colors ' +
                (visualizerMode === 'vinyl'
                  ? 'bg-[var(--accent)] text-[var(--bg)]'
                  : 'text-[var(--text-dim)] hover:text-[var(--text)]')
              }
            >
              Vinyl
            </button>
          </div>
        </div>

        <StationList
          stations={stationApi.stations}
          currentId={stationApi.current.id}
          onSelect={handleSelectStation}
        />

        <section className="flex w-full flex-col gap-5 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/60 p-6 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handlePrev}
              aria-label="Previous station"
              className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-full border border-[var(--border)] bg-[var(--glass)] text-[var(--text)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] sm:h-10 sm:w-10"
            >
              <span aria-hidden="true">⟨</span>
            </button>

            <button
              type="button"
              onClick={() => void engine.togglePlay()}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              aria-pressed={isPlaying}
              className={
                'grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-full border transition-colors sm:h-12 sm:w-12 ' +
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
              onClick={handleNext}
              aria-label="Next station"
              className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-full border border-[var(--border)] bg-[var(--glass)] text-[var(--text)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] sm:h-10 sm:w-10"
            >
              <span aria-hidden="true">⟩</span>
            </button>

            <div
              aria-hidden="true"
              className="mx-1 h-6 w-px shrink-0 bg-[var(--border)]"
            />

            <button
              type="button"
              onClick={engine.toggleMute}
              aria-label={engine.isMuted ? 'Unmute' : 'Mute'}
              aria-pressed={engine.isMuted}
              className={
                'grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-full border transition-colors sm:h-10 sm:w-10 ' +
                (engine.isMuted
                  ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--glass)]'
                  : 'border-[var(--border)] text-[var(--text)] bg-[var(--glass)] hover:border-[var(--accent)] hover:text-[var(--accent)]')
              }
            >
              <span aria-hidden="true">{engine.isMuted ? '🔇' : '🔊'}</span>
            </button>

            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={engine.volume}
              onChange={(e) => engine.setVolume(Number(e.target.value))}
              aria-label="Radio volume"
              // min-w-0 evita que el input de tipo range imponga su min-content
              // y empuje a los botones fuera del contenedor en viewports chicos.
              className="min-w-0 flex-1 cursor-pointer accent-[var(--accent)]"
            />
          </div>

          <div className="flex items-center justify-center border-t border-[var(--border)] pt-4">
            <label className="inline-flex cursor-pointer items-center gap-2 text-xs uppercase tracking-wide text-[var(--text-dim)] transition-colors hover:text-[var(--accent)]">
              <input
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={onFileChange}
              />
              <span className="truncate">
                {fileName ?? 'or load local file'}
              </span>
            </label>
          </div>
        </section>

        <AmbientMixer mixer={mixer} />

        <div className="font-[var(--font-mono)] text-xs uppercase tracking-widest">
          {skipping ? (
            <span className="text-amber-400">
              Status: Error — skipping to next…
            </span>
          ) : allFailed ? (
            <span className="text-amber-400">
              Status: All stations failed — try loading a local file
            </span>
          ) : (
            <span className="text-[var(--text-dim)]">
              <span>Status: </span>
              <span className="text-[var(--text)]">{engine.status}</span>
              <span className="mx-2 text-[var(--border)]">·</span>
              <span className="text-[var(--text)]">
                {stationApi.current.name}
              </span>
            </span>
          )}
        </div>

        <div
          aria-hidden="true"
          className="hidden items-center justify-center gap-2 text-[10px] uppercase tracking-wider text-[var(--text-dim)] sm:flex"
        >
          <kbd className="rounded bg-[var(--surface)] px-1.5 py-0.5 font-[var(--font-mono)]">Space</kbd>
          <span>play</span>
          <span className="text-[var(--border)]">·</span>
          <kbd className="rounded bg-[var(--surface)] px-1.5 py-0.5 font-[var(--font-mono)]">M</kbd>
          <span>mute</span>
          <span className="text-[var(--border)]">·</span>
          <kbd className="rounded bg-[var(--surface)] px-1.5 py-0.5 font-[var(--font-mono)]">←</kbd>
          <kbd className="rounded bg-[var(--surface)] px-1.5 py-0.5 font-[var(--font-mono)]">→</kbd>
          <span>station</span>
        </div>

        <footer className="mt-10 w-full border-t border-[var(--border)] pt-6 text-center">
          <p className="mx-auto max-w-md text-xs leading-relaxed text-[var(--text-dim)]">
            A portfolio experiment in Web Audio, real-time audio visualization,
            and client-side architecture. No backend, no tracking, no accounts —
            just radio.
          </p>
          <p className="mt-2 font-[var(--font-mono)] text-[10px] uppercase tracking-widest text-[var(--text-dim)]">
            Built by Ezequiel Morgado · 2026
          </p>
        </footer>
      </div>

      <a
        href="https://github.com/ezemorgado07/jazz-house-radio"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-4 left-4 z-20 flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)]/70 px-3 py-2 text-xs text-[var(--text-dim)] backdrop-blur-md transition-colors hover:border-[var(--accent)]/40 hover:text-[var(--text)]"
        aria-label="View source code on GitHub"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
          <path d="M9 18c-4.51 2-5-2-7-2" />
        </svg>
        <span className="hidden font-[var(--font-mono)] sm:inline">View source</span>
      </a>
    </main>
  )
}

export default App
