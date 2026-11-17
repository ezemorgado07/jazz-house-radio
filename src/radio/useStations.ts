import { useCallback, useMemo, useRef, useState } from 'react'
import type { Station } from '../types'
import { CURATED_STATIONS } from './stations'

interface UseStationsReturn {
  stations: readonly Station[]
  current: Station
  currentIndex: number
  selectStation: (id: string) => Station | null
  next: () => Station
  prev: () => Station
}

export function useStations(): UseStationsReturn {
  const [stations] = useState<readonly Station[]>(CURATED_STATIONS)
  const [currentIndex, setCurrentIndex] = useState(0)
  // Ref espejo para que next/prev/select puedan devolver la próxima estación
  // sin esperar un render — App.tsx la pasa de una a loadStream.
  const currentIndexRef = useRef(0)

  const current = useMemo(
    () => stations[currentIndex],
    [stations, currentIndex],
  )

  const selectStation = useCallback(
    (id: string): Station | null => {
      const idx = stations.findIndex((s) => s.id === id)
      if (idx === -1) return null
      currentIndexRef.current = idx
      setCurrentIndex(idx)
      return stations[idx]
    },
    [stations],
  )

  const next = useCallback((): Station => {
    const newIndex = (currentIndexRef.current + 1) % stations.length
    currentIndexRef.current = newIndex
    setCurrentIndex(newIndex)
    return stations[newIndex]
  }, [stations])

  const prev = useCallback((): Station => {
    // Sumar stations.length antes del módulo para evitar negativos cuando i=0.
    const newIndex =
      (currentIndexRef.current - 1 + stations.length) % stations.length
    currentIndexRef.current = newIndex
    setCurrentIndex(newIndex)
    return stations[newIndex]
  }, [stations])

  return { stations, current, currentIndex, selectStation, next, prev }
}
