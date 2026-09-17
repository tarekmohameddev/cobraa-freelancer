import fs from 'node:fs'
import https from 'node:https'
import path from 'node:path'
import crypto from 'node:crypto'
import axios from 'axios'
import { debugLog } from '../debug'
import {
  apiBaseUrl,
  getApiMode,
  recordingsDir,
  type ApiMode
} from './config'
import { chatFixture, loginFixture, ocrFixture, translateFixture } from './fixtures'

export type ApiName = 'login' | 'chat' | 'translate' | 'ocr'

const HTTPS_AGENT = new https.Agent({ rejectUnauthorized: false })
const COMMON_HEADERS = {
  'Content-Type': 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
}

export type ApiPostInput = {
  name: ApiName
  apiPath: string
  body: unknown
  fingerprint?: string
  timeoutMs?: number
  maxBodyLength?: number
}

export type ApiPostResult = {
  status: number
  data: unknown
  mode: ApiMode
  fixture?: string
}

function hashFingerprint(value: string) {
  return crypto.createHash('sha1').update(value).digest('hex').slice(0, 12)
}

function fileFor(name: ApiName, fingerprint?: string) {
  const dir = recordingsDir()
  if (fingerprint) {
    return path.join(dir, `${name}__${hashFingerprint(fingerprint)}.json`)
  }
  return path.join(dir, `${name}__default.json`)
}

function readJson(file: string): unknown | null {
  try {
    if (!fs.existsSync(file)) return null
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

function interpolate(value: unknown, vars: Record<string, string>): unknown {
  if (typeof value === 'string') {
    return value.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '')
  }
  if (Array.isArray(value)) return value.map((v) => interpolate(v, vars))
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = interpolate(v, vars)
    }
    return out
  }
  return value
}

function bundled(name: ApiName, fingerprint: string): unknown {
  if (name === 'login') return loginFixture
  if (name === 'chat') return interpolate(chatFixture, { message: fingerprint || '(empty)' })
  if (name === 'translate') {
    const parts = fingerprint.split('|')
    const dst = parts[1] || 'translated'
    const text = parts.slice(2).join('|') || fingerprint || '(empty)'
    return interpolate(translateFixture, { text: `[${dst}] ${text}` })
  }
  return ocrFixture
}

function loadFixture(name: ApiName, fingerprint: string): { data: unknown; fixture: string } {
  const exact = fingerprint ? readJson(fileFor(name, fingerprint)) : null
  if (exact && typeof exact === 'object' && exact && 'data' in (exact as object)) {
    const rec = exact as { status?: number; data: unknown }
    return { data: rec.data, fixture: fileFor(name, fingerprint) }
  }
  if (exact) return { data: exact, fixture: fileFor(name, fingerprint) }

  const fallback = readJson(fileFor(name))
  if (fallback && typeof fallback === 'object' && fallback && 'data' in (fallback as object)) {
    const rec = fallback as { data: unknown }
    return { data: rec.data, fixture: fileFor(name) }
  }
  if (fallback) return { data: fallback, fixture: fileFor(name) }

  return { data: bundled(name, fingerprint), fixture: `bundled:${name}` }
}

function sanitizeForDisk(data: unknown): unknown {
  if (data == null) return data
  if (typeof data !== 'object') return data
  if (Array.isArray(data)) return data.map(sanitizeForDisk)
  const obj = data as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj)) {
    const key = k.toLowerCase()
    if (key === 'password' || key === 'sign' || key === 'uidtoken') {
      out[k] = '[stripped]'
      continue
    }
    if (key === 'token' && typeof v === 'string') {
      out[k] = 'mock-session-token'
      continue
    }
    if ((key === 'messages' || key === 'imagebase64') && typeof v === 'string' && v.length > 400) {
      out[k] = `[omitted ${v.length} chars]`
      continue
    }
    out[k] = sanitizeForDisk(v)
  }
  return out
}

function saveRecording(name: ApiName, fingerprint: string, status: number, data: unknown) {
  const dir = recordingsDir()
  fs.mkdirSync(dir, { recursive: true })
  const payload = {
    name,
    fingerprint,
    recordedAt: new Date().toISOString(),
    status,
    data: sanitizeForDisk(data)
  }
  const text = JSON.stringify(payload, null, 2)
  fs.writeFileSync(fileFor(name, fingerprint || undefined), text, 'utf8')
  fs.writeFileSync(fileFor(name), text, 'utf8')
}

export async function apiPostJson(input: ApiPostInput): Promise<ApiPostResult> {
  const mode = getApiMode()
  const fingerprint = (input.fingerprint || '').trim()
  const url = `${apiBaseUrl()}${input.apiPath}`

  if (mode === 'mock') {
    await new Promise((r) => setTimeout(r, 180))
    const loaded = loadFixture(input.name, fingerprint)
    debugLog('api.mock', { name: input.name, fingerprint, fixture: loaded.fixture })
    return { status: 200, data: loaded.data, mode, fixture: loaded.fixture }
  }

  debugLog('api.request', { mode, name: input.name, url, fingerprint })
  const res = await axios.post(url, input.body, {
    headers: COMMON_HEADERS,
    timeout: input.timeoutMs ?? 60_000,
    httpsAgent: HTTPS_AGENT,
    maxRedirects: 5,
    maxBodyLength: input.maxBodyLength,
    maxContentLength: input.maxBodyLength,
    validateStatus: () => true
  })

  debugLog('api.response', { name: input.name, status: res.status, body: res.data })

  if (mode === 'record') {
    try {
      saveRecording(input.name, fingerprint, res.status, res.data)
      debugLog('api.recorded', { name: input.name, fingerprint, file: fileFor(input.name, fingerprint || undefined) })
    } catch (e: any) {
      debugLog('api.record-error', { message: e?.message || String(e) })
    }
  }

  return { status: res.status, data: res.data, mode }
}
