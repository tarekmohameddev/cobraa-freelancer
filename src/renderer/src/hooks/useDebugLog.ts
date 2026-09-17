import { useEffect, useMemo, useState } from 'react'
import { getApi, type DebugEvent } from '@renderer/lib/ipc'

export function useDebugLog() {
  const [events, setEvents] = useState<DebugEvent[]>([])

  useEffect(() => {
    const unsub = getApi().onDebugEvent((evt) => {
      setEvents((prev) => {
        const next = [...prev, evt]
        return next.length > 200 ? next.slice(next.length - 200) : next
      })
    })
    return unsub
  }, [])

  return useMemo(
    () => ({
      events,
      clear: () => setEvents([])
    }),
    [events]
  )
}

