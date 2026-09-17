import { setSession, type AuthSession } from './session'
import { debugLog } from './debug'
import { apiPostJson } from './api/http'
import { isMockMode } from './api/config'

type LoginResponse =
  | {
      success: true
      code: number
      data: {
        userInfo: { uid: number }
        token: string
      }
    }
  | {
      success: false
      code: number
      message?: string
      msg?: string
      data?: unknown
    }

export async function loginWithEmailPassword(input: { email: string; password: string }) {
  const body = {
    email: input.email,
    password: input.password,
    customName: 'otek'
  }

  debugLog('auth.request', {
    method: 'POST',
    path: '/template/web/v1/user/email/pwd/login',
    mock: isMockMode(),
    body: { email: input.email, password: '[redacted]', customName: 'otek' }
  })

  const res = await apiPostJson({
    name: 'login',
    apiPath: '/template/web/v1/user/email/pwd/login',
    body,
    fingerprint: input.email.trim().toLowerCase(),
    timeoutMs: 30_000
  })

  const data = res.data as LoginResponse
  debugLog('auth.response', { status: res.status, body: data, mode: res.mode })

  if (!data || (data as LoginResponse).success !== true) {
    const msg = (data as any)?.message || (data as any)?.msg || 'Login failed'
    throw new Error(msg)
  }

  const ok = data as Extract<LoginResponse, { success: true }>
  const session: AuthSession = {
    userId: ok.data.userInfo.uid,
    token: ok.data.token,
    email: input.email
  }
  setSession(session)
  return session
}

export function logout() {
  setSession(null)
}
