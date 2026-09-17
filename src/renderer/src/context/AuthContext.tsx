import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { AuthLoginInput, AuthSession } from '@renderer/lib/ipc'
import { getApi } from '@renderer/lib/ipc'

type AuthState = {
  session: AuthSession | null
  loading: boolean
}

type AuthContextValue = AuthState & {
  login: (input: AuthLoginInput) => Promise<{ ok: true } | { ok: false; error: string }>
  logout: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = async () => {
    try {
      const res = await getApi().authGetSession()
      if (res.ok) setSession(res.session)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const login = async (input: AuthLoginInput) => {
    setLoading(true)
    try {
      const res = await getApi().authLogin(input)
      if (!res.ok) return { ok: false as const, error: res.error }
      setSession(res.session)
      return { ok: true as const }
    } catch (e: any) {
      return { ok: false as const, error: e?.message || 'Login failed' }
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    setLoading(true)
    try {
      await getApi().authLogout()
      setSession(null)
    } finally {
      setLoading(false)
    }
  }

  const value = useMemo<AuthContextValue>(
    () => ({ session, loading, login, logout, refresh }),
    [session, loading]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

