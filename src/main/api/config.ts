import fs from 'node:fs'
import path from 'node:path'

export type ApiMode = 'live' | 'record' | 'mock'

const PLACEHOLDER = 'FREELANCER_BUILD'

/** Real vendor host. Stripped to a dummy value in freelancer copies. */
export const API_HOST = process.env.COBRAA_API_HOST || 'api.local.mock'

export const APP_KEY = process.env.COBRAA_APP_KEY || 'FREELANCER_BUILD'
export const SIGN_KEY = process.env.COBRAA_SIGN_KEY || 'FREELANCER_BUILD'

function lockPaths() {
  return [
    path.join(process.cwd(), 'src', 'main', 'api', 'freelancer.lock'),
    path.join(__dirname, 'freelancer.lock')
  ]
}

export function isFreelancerBuild() {
  return lockPaths().some((p) => {
    try {
      return fs.existsSync(p)
    } catch {
      return false
    }
  })
}

export function hasLiveSecrets() {
  if (isFreelancerBuild()) return false
  if (!APP_KEY || !SIGN_KEY) return false
  if (APP_KEY.includes(PLACEHOLDER) || SIGN_KEY.includes(PLACEHOLDER)) return false
  if (API_HOST.includes('mock') || API_HOST === 'example.invalid') return false
  return APP_KEY.length >= 16 && SIGN_KEY.length >= 8
}

export function getApiMode(): ApiMode {
  const raw = (process.env.COBRAA_API_MODE || '').trim().toLowerCase()
  if (raw === 'live' || raw === 'record' || raw === 'mock') {
    if (raw !== 'mock' && !hasLiveSecrets()) return 'mock'
    return raw
  }
  return hasLiveSecrets() ? 'live' : 'mock'
}

export function isMockMode() {
  return getApiMode() === 'mock'
}

export function recordingsDir() {
  if (process.env.COBRAA_RECORD_DIR) return process.env.COBRAA_RECORD_DIR
  return path.join(process.cwd(), 'fixtures', 'api', 'recorded')
}

export function apiBaseUrl() {
  return `https://${API_HOST}`
}

export function speechWsBase() {
  return `wss://${API_HOST}/template/ws/v1/speech/recognize/`
}
