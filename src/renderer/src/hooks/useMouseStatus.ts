import { useEffect, useState } from 'react'
import { getApi, type MouseServiceStatus } from '@renderer/lib/ipc'

export function useMouseStatus() {
  const [status, setStatus] = useState<MouseServiceStatus | null>(null)

  useEffect(() => {
    void getApi()
      .mouseStatus()
      .then(setStatus)
      .catch(() => {})
    return getApi().onMouseStatus(setStatus)
  }, [])

  return status
}
