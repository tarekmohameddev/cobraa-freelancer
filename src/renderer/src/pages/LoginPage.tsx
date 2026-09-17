import React, { useEffect, useMemo, useState } from 'react'
import { Bot, Lock, Mail } from 'lucide-react'
import { useAuth } from '@renderer/context/AuthContext'
import { getApi } from '@renderer/lib/ipc'

export function LoginPage() {
  const { login, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [mock, setMock] = useState(false)

  useEffect(() => {
    void getApi()
      .apiMode()
      .then((res) => setMock(Boolean(res.mock)))
      .catch(() => {})
  }, [])

  const canSubmit = useMemo(
    () => (mock || (email.trim().length > 3 && password.length > 0)) && !loading,
    [email, password, loading, mock]
  )

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    const res = await login({
      email: email.trim() || 'dev@mock.local',
      password: password || 'mock'
    })
    if (!res.ok) setError(res.error)
  }

  const onMockContinue = async () => {
    setError(null)
    const res = await login({ email: 'dev@mock.local', password: 'mock' })
    if (!res.ok) setError(res.error)
  }

  return (
    <div className="h-full grid place-items-center p-6">
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-emerald-200/50 via-zinc-50 to-sky-200/40 dark:from-emerald-950/40 dark:via-zinc-950 dark:to-sky-950/40" />

      <div className="w-full max-w-md rounded-2xl border border-white/60 bg-white/70 p-6 shadow-xl backdrop-blur dark:border-white/10 dark:bg-zinc-900/70">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-600 text-white shadow">
            <Bot className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <div className="text-lg font-semibold leading-6">Cobraa</div>
            <div className="text-sm text-zinc-600 dark:text-zinc-400">
              {mock ? 'Mock API workspace — live keys are not loaded' : 'Sign in to start chatting'}
            </div>
          </div>
        </div>

        {mock ? (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
            Vendor APIs are replayed from fixtures. Any password works, or continue without an account.
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          <label className="block">
            <div className="mb-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">Email</div>
            <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm focus-within:ring-2 focus-within:ring-emerald-500/40 dark:border-zinc-800 dark:bg-zinc-950">
              <Mail className="h-4 w-4 text-zinc-500" />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                placeholder={mock ? 'anything@local' : 'user@example.com'}
                className="w-full bg-transparent outline-none"
                autoComplete="email"
              />
            </div>
          </label>

          <label className="block">
            <div className="mb-1 text-xs font-medium text-zinc-600 dark:text-zinc-400">Password</div>
            <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm shadow-sm focus-within:ring-2 focus-within:ring-emerald-500/40 dark:border-zinc-800 dark:bg-zinc-950">
              <Lock className="h-4 w-4 text-zinc-500" />
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                type="password"
                placeholder={mock ? 'any password' : '••••••••'}
                className="w-full bg-transparent outline-none"
                autoComplete="current-password"
              />
            </div>
          </label>

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={!canSubmit}
            className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>

          {mock ? (
            <button
              type="button"
              onClick={() => void onMockContinue()}
              disabled={loading}
              className="inline-flex w-full items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Continue with mock account
            </button>
          ) : null}

          <div className="pt-3 text-xs text-zinc-500 dark:text-zinc-400">
            {mock
              ? 'Run npm run mouse-sim in another terminal to press the 4 extra mouse buttons.'
              : 'Uses Otek/MiMouse global API (email/password). Your credentials are sent only to the API endpoint.'}
          </div>
        </form>
      </div>
    </div>
  )
}


