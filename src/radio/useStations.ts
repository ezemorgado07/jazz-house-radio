import { useCallback, useMemo, useState } from 'react'
import type { Station } from '../types'
import { CURATED_STATIONS } from './stations'

interface UseStationsReturn {
  stations: readonly Station[]
  current: Station
  currentIndex: number
  selectStation: (id: string) => void
  next: () => void
  prev: () => void
}

export function useStations(): UseStationsReturn {
  const [stations] = useState<readonly Station[]>(CURATED_STATIONS)
  const [currentIndex, setCurrentIndex] = useState(0)

  const current = useMemo(
    () => stations[currentIndex],
    [stations, currentIndex],
  )

  const selectStation = useCallback(
    (id: string) => {
      const idx = stations.findIndex((s) => s.id === id)
      if (idx === -1) return
      setCurrentIndex(idx)
    },
    [stations],
  )

  const next = useCallback(() => {
    setCurrentIndex((i) => (i + 1) % stations.length)
  }, [stations])

  const prev = useCallback(() => {
    // Sumar stations.length antes del módulo para evitar negativos cuando i=0.
    setCurrentIndex((i) => (i - 1 + stations.length) % stations.length)
  }, [stations])

  return { stations, current, currentIndex, selectStation, next, prev }
}
