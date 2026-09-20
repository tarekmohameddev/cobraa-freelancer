import React, { useEffect, useMemo, useState } from 'react'
import { AuthProvider, useAuth } from '@renderer/context/AuthContext'
import { LoginPage } from '@renderer/pages/LoginPage'
import { AppShell } from '@renderer/components/AppShell'
import { useGlobalVoiceDictation } from '@renderer/hooks/useGlobalVoiceDictation'

function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const stored = localStorage.getItem('cobraa:theme')
    return stored === 'dark' ? 'dark' : 'light'
  })

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'dark') root.classList.add('dark')
    else root.classList.remove('dark')
    localStorage.setItem('cobraa:theme', theme)
  }, [theme])

  return { theme, setTheme }
}

function InnerApp() {
  const { session, loading } = useAuth()
  const { theme, setTheme } = useTheme()
  useGlobalVoiceDictation()

  const content = useMemo(() => {
    if (loading) {
      return (
        <div className="h-full grid place-items-center">
          <div className="text-sm text-zinc-500 dark:text-zinc-400">Loading Cobraa…</div>
        </div>
      )
    }
    if (!session) return <LoginPage />
    return <AppShell theme={theme} setTheme={setTheme} />
  }, [loading, session, theme, setTheme])

  return content
}

export function App() {
  return (
    <AuthProvider>
      <InnerApp />
    </AuthProvider>
  )
}

